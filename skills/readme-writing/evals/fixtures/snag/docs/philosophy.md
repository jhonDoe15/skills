# Why snag exists

Code review keeps catching the same two leftovers: a debugger call someone
forgot to remove, and a block pasted from elsewhere in the file instead of
reused. Reviewers should not spend their attention on either. snag finds both
before a commit, so the review starts from code that is ready to be read.

snag has no configuration file. Every check is on in every project, so a team
never debates which checks to enable. To keep one line that snag flags, put a
`snag: ignore` comment on that line. If a check is wrong for most code, open
an issue: we would rather change one check for everyone than add a setting.

We add a check only when it has no false positives in ordinary code, and we
add languages one check at a time.
