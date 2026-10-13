# snag

- Finds debugger calls
- Finds duplicated blocks
- Fast
- Supports Python and TypeScript
- No configuration

## Install

```bash
npm install -g snag
```

## Usage

```bash
snag check <directory> [--format text|json]
```

Example:

```text
$ snag check examples/sample
src/app.py:14 duplicate-block  lines 14-16 repeat lines 5-7
src/web.ts:14 debug-call  debugger call left in code
2 findings
```

### Flags

| Flag | Values | Default | Description |
| --- | --- | --- | --- |
| `--format` | `text`, `json` | `text` | Output format. `json` prints an array of findings. |

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No findings |
| 1 | One or more findings |
| 2 | Usage error or the target is not a directory |

## Layout

- `bin/snag.js`: command-line entry point
- `src/index.js`: walks the directory and runs the checks
- `src/checks/debug-call.js`: `breakpoint()`, `pdb.set_trace()`, `debugger;`, `console.log(`
- `src/checks/duplicate-block.js`: three or more repeated lines

## License

MIT
