# Compact Celsius rendering

Immutable revision: `1111111111111111111111111111111111111111`

## Ticket TEMP-14

Add a keyword-only `compact: bool = False` parameter to `format_celsius`.

- Default output must remain byte-for-byte unchanged.
- With `compact=True`, omit the single ASCII space before `°C`.
- Preserve one-decimal formatting and rounding.
- Change only the formatter and its direct tests.
- Add no configuration, localization, units, or dependencies.

## Repository snapshot

`AGENTS.md`

```markdown
Public APIs retain backward-compatible defaults.
Formatting-only changes add no runtime dependencies.
```

`src/tinyunits/temperature.py`

```python
def format_celsius(value: float) -> str:
    return f"{value:.1f} °C"
```

`tests/test_temperature.py`

```python
from tinyunits.temperature import format_celsius


def test_formats_celsius():
    assert format_celsius(0) == "0.0 °C"
    assert format_celsius(-2.25) == "-2.2 °C"
```

`pyproject.toml` configures pytest to collect `tests/`.

## Authority and commands

The ticket controls signature, behavior, and scope. `AGENTS.md` controls compatibility and dependencies. Existing code and tests describe current formatting. The repository commands are `python -m pytest -q tests/test_temperature.py` and `python -m pytest -q`.
