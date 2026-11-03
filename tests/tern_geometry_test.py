"""Run with: python3 tests/tern_geometry_test.py"""
import importlib.util
from pathlib import Path
import unittest
import os, pty, select, signal, struct, fcntl, termios, time, sys, json

spec = importlib.util.spec_from_file_location('geometry', Path(__file__).resolve().parents[1] / 'scripts/tern-geometry.py')
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)

class GeometryTests(unittest.TestCase):
    def test_queries_at_every_chunk_boundary(self):
        stream = b'hello\x1b[14tmiddle\x1b[16tbye'
        for cut in range(len(stream) + 1):
            first, tail, replies = geometry.query_filter(stream[:cut], (10, 20), 30, 80)
            last, tail, more = geometry.query_filter(tail + stream[cut:], (10, 20), 30, 80)
            self.assertEqual(first + last, b'hellomiddlebye')
            self.assertEqual(tail, b'')
            self.assertCountEqual(replies + more, [b'\x1b[4;600;800t', b'\x1b[6;20;10t'])

    def test_resize_and_unrelated_output(self):
        output = b'\x1b[31mtext\x1b[0m'
        self.assertEqual(geometry.query_filter(output, (9, 18), 24, 80), (output, b'', []))
        _, _, replies = geometry.query_filter(b'\x1b[16t\x1b[16t', (12, 24), 40, 100)
        self.assertEqual(replies, [b'\x1b[6;24;12t'] * 2)

    def test_reply_splits_and_input(self):
        packet = b'\x1b_tsp;r;{"r":"hello","cell":{"w":12,"h":24},"cols":1}\x1b\\'
        for cut in range(len(packet)+1):
            parser = geometry.ReplyParser()
            a, cells = parser.feed(b'abc\x1b[A'+packet[:cut], 0)
            b, more = parser.feed(packet[cut:]+b'xyz\x1b[B', .01)
            self.assertEqual(a+b, b'abc\x1b[Axyz\x1b[B')
            self.assertEqual(cells+more, [(12,24)])
        parser = geometry.ReplyParser()
        self.assertEqual(parser.feed(b'\x1b', 0), (b'', []))
        self.assertEqual(parser.flush(.1), b'\x1b')
        parser.feed(b'\x1b_tsp;r;'+b'x'*9000, 0)
        self.assertLessEqual(len(parser.buffer),8192)
        for body in (b'bad', b'{"r":"hello","cell":{"w":0,"h":20}}', b'{"r":"hello","cell":null}'):
            self.assertEqual(geometry.ReplyParser().feed(b'\x1b_tsp;r;'+body+b'\x1b\\',0), (b'',[]))

    def test_retry_clock(self):
        refresh = geometry.Refresh()
        for now in (0,.02,.04,.06): refresh.resize(now)
        self.assertFalse(refresh.tick(.17))
        self.assertTrue(refresh.tick(.19))
        refresh.resize(.2)
        self.assertFalse(refresh.tick(2.2))
        self.assertTrue(refresh.tick(2.71))
        self.assertFalse(refresh.tick(4.72))
        self.assertTrue(refresh.tick(5.73))
        self.assertFalse(refresh.tick(7.74))
        self.assertFalse(refresh.tick(100))
        refresh.resize(101)
        self.assertTrue(refresh.tick(102))
        refresh.received()
        self.assertFalse(refresh.tick(200))

    def test_real_pty_resize_survival(self):
        child, master = pty.fork()
        if child == 0:
            code = "import os,tty,fcntl,termios,struct; tty.setraw(0); os.write(1,b'READY'); data=b''\nwhile b'END' not in data: data+=os.read(0,1024)\nos.write(1,b'INPUT:'+data.hex().encode()+b':SIZE:'+repr(struct.unpack('HHHH',fcntl.ioctl(0,termios.TIOCGWINSZ,b'\\0'*8))).encode()+b':DONE')"
            os.execv(sys.executable,[sys.executable,str(Path(geometry.__file__)), '--', sys.executable,'-c',code])
        received = b''
        def until(marker, timeout=5):
            nonlocal received
            end=time.monotonic()+timeout
            while marker not in received and time.monotonic()<end:
                if select.select([master],[],[],.05)[0]:
                    received += os.read(master,65536)
            self.assertIn(marker,received)
        packet=b'\x1b_tsp;r;{"r":"hello","cell":{"w":10,"h":20},"cols":80}\x1b\\'
        try:
            fcntl.ioctl(master,termios.TIOCSWINSZ,struct.pack('HHHH',24,80,0,0))
            until(geometry.HELLO)
            os.write(master,packet)
            until(b'READY')
            for n in range(20):
                fcntl.ioctl(master,termios.TIOCSWINSZ,struct.pack('HHHH',30+n,100+n,0,0))
                os.kill(child,signal.SIGWINCH)
            received=b''
            until(geometry.HELLO)
            # Leave the runtime request unanswered past its deadline, while input flows.
            os.write(master,b'abc\x1b[A')
            end=time.monotonic()+2.3
            while time.monotonic()<end:
                if select.select([master],[],[],.05)[0]: received+=os.read(master,65536)
            self.assertEqual(os.waitpid(child,os.WNOHANG),(0,0))
            os.write(master,packet[:17])
            time.sleep(.08)
            os.write(master,packet[17:])
            time.sleep(.08)
            os.write(master,b'xyzEND')
            until(b':DONE')
            self.assertIn(b'INPUT:'+b'abc\x1b[AxyzEND'.hex().encode()+b':SIZE:(49, 119, 1190, 980):DONE',received)
            _,status=os.waitpid(child,0); child=None
            self.assertEqual(os.waitstatus_to_exitcode(status),0)
        finally:
            os.close(master)
            if child:
                os.kill(child,signal.SIGKILL); os.waitpid(child,0)

if __name__ == '__main__':
    unittest.main()
