# Allowlisted Declarative Repairs

AI models only return structured, schema-validated **Repair Actions** from a fixed allowlist, which a deterministic repair engine in the content script executes and can undo, rather than generating JavaScript or CSS patches. This is required for Manifest V3 Content Security Policy compliance and guarantees PHANTOM never executes untrusted code from webpage content, AI output, or community recipes.
