#!/usr/bin/env python3
"""Run a Linux command in Tern with live pixel geometry.

Adapted from the user's Pi_Space/zellij-tern.py. No Zellij dependency.
"""
import argparse, errno, fcntl, json, os, pty, re, select, signal, struct, sys, termios, time, tty
HELLO=b'\x1b_tsp;q;{"q":"hello","v":[1],"app":"sydney-kit-geometry"}\x1b\\'
REPLY=re.compile(rb'\x1b(?:\]877;tsp;|_tsp;)r;(.*?)\x1b\\',re.S)
QUERIES=(b'\x1b[14t',b'\x1b[16t')
def write_all(fd,data):
    view=memoryview(data)
    while view:
        n=os.write(fd,view)
        if n<=0: raise OSError('Terminal write failed')
        view=view[n:]
class ReplyParser:
    """Bounded streaming TSP demultiplexer; ordinary escape sequences pass through."""
    prefixes = (b'\x1b]877;tsp;r;', b'\x1b_tsp;r;')
    def __init__(self):
        self.buffer = b''
        self.since = None
    def feed(self, data, now):
        self.buffer += data
        output = bytearray(); cells = []
        while self.buffer:
            prefix = next((p for p in self.prefixes if self.buffer.startswith(p)), None)
            if prefix:
                end = self.buffer.find(b'\x1b\\', len(prefix))
                if end < 0 and len(self.buffer) <= 8192:
                    break
                if end >= 0:
                    packet = self.buffer[:end+2]
                    self.buffer = self.buffer[end+2:]
                    try:
                        obj = json.loads(packet[len(prefix):-2])
                    except (ValueError, UnicodeError):
                        continue  # A malformed protocol reply is not keyboard input.
                    if isinstance(obj, dict) and obj.get('r') == 'hello':
                        cell = valid_cell(obj)
                        if cell: cells.append(cell)
                    else:
                        output.extend(packet)
                    continue
            elif any(p.startswith(self.buffer) for p in self.prefixes):
                break
            output.append(self.buffer[0]); self.buffer = self.buffer[1:]
        self.since = now if self.buffer and self.since is None else self.since
        if not self.buffer: self.since = None
        return bytes(output), cells
    def flush(self, now):
        # Only ambiguous prefix bytes (e.g. a standalone Escape) expire quickly.
        if self.since is not None and now-self.since >= 0.05 and not any(self.buffer.startswith(p) for p in self.prefixes):
            result = self.buffer; self.buffer = b''; self.since = None
            return result
        return b''

def valid_cell(obj):
    try:
        cell = obj['cell']; w = round(cell['w']); h = round(cell['h'])
        if 1 < w <= 65535 and 1 < h <= 65535: return w, h
    except (KeyError, TypeError, ValueError, OverflowError):
        pass

class Refresh:
    """At most three attempts per resize burst; a pending query is never restarted."""
    def __init__(self):
        self.due = None; self.deadline = None; self.attempts = 0
    def resize(self, now):
        if self.deadline is None:
            self.due = now + 0.12
            self.attempts = 0
    def received(self):
        self.due = self.deadline = None; self.attempts = 0
    def tick(self, now):
        if self.deadline is not None and now >= self.deadline:
            self.deadline = None
            self.due = now + 0.5 * 2**(self.attempts-1) if self.attempts < 3 else None
        if self.due is not None and now >= self.due:
            self.due = None; self.deadline = now + 2; self.attempts += 1
            return True
        return False

def geometry(fd):
    write_all(fd,HELLO); data=b''; end=time.monotonic()+2
    while time.monotonic()<end:
        if not select.select([fd],[],[],max(0,end-time.monotonic()))[0]: break
        data+=os.read(fd,65536)
        for m in REPLY.finditer(data):
            try: obj=json.loads(m[1])
            except (ValueError,UnicodeError): continue
            if isinstance(obj,dict) and obj.get('r')=='hello':
                cell=valid_cell(obj); cols=obj.get('cols',0)
                if cell and isinstance(cols,int) and 0<cols<=65535:
                    return (*cell,cols),data[:m.start()]+data[m.end():]
    raise RuntimeError('No Tern TSP geometry reply; run directly in Tern, outside another multiplexer')
def query_filter(data,cell,rows,cols):
    w,h=cell; replies=[]
    for q,answer in ((QUERIES[0],f'\x1b[4;{rows*h};{cols*w}t'),(QUERIES[1],f'\x1b[6;{h};{w}t')):
        count=data.count(q)
        if count: replies.extend([answer.encode()]*count); data=data.replace(q,b'')
    keep=0
    for q in QUERIES:
        for n in range(1,len(q)):
            if data.endswith(q[:n]): keep=max(keep,n)
    return (data[:-keep] if keep else data),(data[-keep:] if keep else b''),replies

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--log',help='Optional diagnostic geometry JSON file')
    parser.add_argument('args',nargs=argparse.REMAINDER)
    args=parser.parse_args(); command=args.args
    if command[:1]==['--']: command=command[1:]
    if not command: command=['pi']
    fd=os.open('/dev/tty',os.O_RDWR); old=termios.tcgetattr(fd); child=None; master=None
    try:
        tty.setraw(fd); (w,h,cols),pending_input=geometry(fd)
        actual_rows,actual_cols,_,_=struct.unpack('HHHH',fcntl.ioctl(fd,termios.TIOCGWINSZ,b'\0'*8))
        rows=actual_rows or 24; cols=actual_cols or cols
        child,master=pty.fork()
        if child==0:
            termios.tcsetattr(0,termios.TCSANOW,old)
            fcntl.ioctl(0,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,min(65535,cols*w),min(65535,rows*h)))
            os.execvp(command[0],command)
        resized=[False]
        signal.signal(signal.SIGWINCH,lambda *_:resized.__setitem__(0,True))
        def record():
            if args.log:
                with open(args.log,'w') as f: json.dump({'source':'Tern TSP hello','cell':{'w':w,'h':h},'rows':rows,'cols':cols,'command':command},f,indent=2)
        input_parser = ReplyParser(); refresh = Refresh()
        def apply_size():
            nonlocal rows, cols
            actual_rows, actual_cols, _, _ = struct.unpack('HHHH',fcntl.ioctl(fd,termios.TIOCGWINSZ,b'\0'*8))
            rows = actual_rows or rows; cols = actual_cols or cols
            fcntl.ioctl(master,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,min(65535,cols*w),min(65535,rows*h)))
            record()
        apply_size()
        if pending_input:
            extra, _ = input_parser.feed(pending_input, time.monotonic())
            if extra: write_all(master,extra)
        tail=b''
        while True:
            now = time.monotonic()
            if resized[0]:
                resized[0]=False
                apply_size()
                refresh.resize(now)
            if refresh.tick(now): write_all(fd,HELLO)
            extra = input_parser.flush(now)
            if extra: write_all(master,extra)
            ready,_,_=select.select([fd,master],[],[],0.025)
            if fd in ready:
                chunk=os.read(fd,65536)
                if not chunk: break
                extra, cells = input_parser.feed(chunk, time.monotonic())
                if extra: write_all(master,extra)
                if cells:
                    w,h = cells[-1]; refresh.received(); apply_size()
            if master in ready:
                try: chunk=os.read(master,65536)
                except OSError as exc:
                    if exc.errno==errno.EIO: break
                    raise
                if not chunk: break
                output,tail,replies=query_filter(tail+chunk,(w,h),rows,cols)
                if output: write_all(fd,output)
                for reply in replies: write_all(master,reply)
        if tail: write_all(fd,tail)
        _,status=os.waitpid(child,0); child=None
        return os.waitstatus_to_exitcode(status)
    finally:
        termios.tcsetattr(fd,termios.TCSANOW,old); os.close(fd)
        if master is not None: os.close(master)
        if child is not None:
            try: os.kill(child,signal.SIGHUP)
            except ProcessLookupError: pass
if __name__=='__main__':
    try: sys.exit(main())
    except (RuntimeError,OSError) as exc: print(f'sydney-kit tern: {exc}',file=sys.stderr); sys.exit(1)
