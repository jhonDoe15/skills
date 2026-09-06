# Ellipsis on truncation

Immutable revision: `2222222222222222222222222222222222222222`

## Ticket TEXT-22

Change `truncate` so truncated output ends in the single character `…`.

- `max_chars` counts Rust `char` values, not bytes or grapheme clusters.
- Return input unchanged when it fits.
- Return an empty string when truncation occurs and `max_chars == 0`.
- When truncation occurs and `max_chars >= 1`, reserve the final character for `…`.
- Keep the public function signature.
- Support Rust 1.78 and add no dependency.

Examples: `truncate("abcdef", 4) == "abc…"`, `truncate("éclair", 2) == "é…"`, and `truncate("abc", 3) == "abc"`.

## Repository snapshot

`Cargo.toml`

```toml
[package]
name = "linecrop"
version = "0.1.0"
edition = "2021"
rust-version = "1.78"
```

`src/lib.rs`

```rust
pub fn truncate(input: &str, max_chars: usize) -> String {
    if input.chars().count() <= max_chars {
        return input.to_owned();
    }

    input.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::truncate;

    #[test]
    fn preserves_text_that_fits() {
        assert_eq!(truncate("abc", 3), "abc");
    }
}
```

## Authority and commands

The ticket defines boundary behavior and character semantics. `Cargo.toml` constrains language version and dependencies. The public signature is compatibility authority. The repository command is `cargo test`.
