# Engineering baseline 9: security

Load when guideline 9's trigger in [the mandatory index](engineering-baseline.md)
applies. Apply this guidance and record the source and resulting design or
proof obligation.

**Derive security requirements and proof from the applicable standard.**
**Source:** NIST [SP 800-218 SSDF
v1.1](https://csrc.nist.gov/pubs/sp/800/218/final) and the OWASP [Application
Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/).
**Ask:** What assets, trust boundaries, actors, abuse/failure cases,
authorization rules, input/output constraints, dependency risks, and
verification requirements change? Which exact standard/version requirement
supplies proof? **Counterweight:** SSDF
governs secure-development practices; ASVS supplies web-application
verification requirements. Select the applicable subset and assurance level
under organization policy; do not turn either into an unscoped checklist or
apply web controls to unrelated software.
