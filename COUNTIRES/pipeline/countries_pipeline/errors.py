class PipelineError(Exception):
    """Only sanitized, public-safe messages may be put in this exception."""

    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class MissingCountryCodes(PipelineError):
    """A provider record outside this catalog's ISO-code-based coverage."""
