# Offline repair + migration

Close **all Pi processes** for this Unix user before preview, apply or rollback. Run from an ordinary terminal. The Linux `/proc` check refuses recognized node/bun Pi entrypoints and ambiguous `cli.js` entrypoints; it cannot exclude a writer starting later. No processes are killed. The exclusive `sessions.offline-repair.lock` only excludes another invocation of this wrapper: it is not a general writer lock. Following a crash, inspect processes and backups before manually removing a stale lock.

Preview (default) validates the full migration using an in-memory repaired file and checks destination collisions. It never writes session history; it briefly creates the wrapper lock. It accepts only the hardcoded relative file path, line 177 containing exactly 922 NUL bytes followed by LF, and no other NUL-bearing line. Any mismatch or invalid remaining JSON refuses the operation.

```sh
node /home/sydney/Workspace/projects/sydney-kit/scripts/offline-repair-migrate.mjs
```

After reviewing preview, execute the authorized operation:

```sh
node /home/sydney/Workspace/projects/sydney-kit/scripts/offline-repair-migrate.mjs --apply
```

Optional `--sessions-root PATH --destination PATH` select fixture roots. The real defaults are `~/.pi/agent/sessions` and `~/.pi/agent/subagent-sessions`.

Before the first history write the wrapper saves original bytes in a sibling `sessions.repair-*/original.bak` and writes `repair.json` with SHA-256 hashes. It prints that record path. It then performs the existing migration, whose backups and manifest reside under the destination `.migration-*`. The successful manifest path is printed and stored in the repair record. Keep both archives.

To undo a successful run, while Pi remains closed:

```sh
node /home/sydney/Workspace/projects/sydney-kit/scripts/offline-repair-migrate.mjs --rollback /ABSOLUTE/PATH/TO/repair.json --apply
```

This rolls back migration first, verifies the original backup and repaired file hashes, then restores the original bytes (including the NUL hole). Changed content blocks restoration. On migration failure, the existing migrator attempts rollback and the wrapper restores the repair only if its bytes still match. Errors print the migration manifest; `failedManifest` is recorded when available. A refused rollback needs inspection: do not overwrite changed history. For interrupted runs, first use the existing migrator's `--rollback MANIFEST --apply`, then the repair rollback command with the matching record (whose `manifest` may be null). If the original file is already restored, no further repair rollback is necessary. These steps are not crash-atomic or safe against concurrent writers.
