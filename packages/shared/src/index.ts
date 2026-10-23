// Cross-application contracts shared by the API and the web app.
// Keep this package limited to types and contracts that both applications genuinely use.

/** Error response body returned by every API error (404, 500, ...). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Response of `GET /health`. It reports only that the API process is running.
 * External dependencies are not checked until they are integrated, so they are
 * reported as `not_configured` rather than healthy.
 */
export interface HealthResponse {
  status: 'ok';
  service: 'kulvriksh-api';
  dependencies: {
    database: 'not_configured';
  };
}
