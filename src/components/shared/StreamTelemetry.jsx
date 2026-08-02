/**
 * @file StreamTelemetry.jsx
 * @description Displays the readings from `useStreamTelemetry`.
 */

/** Throughput at which the meter reads full, in tokens per second. */
const METER_CEILING = 120

/**
 * Latency and throughput for the last generation.
 *
 * Speed is prefixed with `~` because token counts are estimated from character
 * length, not reported by the gateway. Better to say so than to imply a
 * precision the number does not have.
 *
 * @param {Object} props
 * @param {number} props.latencyMs - Time to first token.
 * @param {number} props.tokensPerSecond - Generation throughput.
 */
export function StreamTelemetry({ latencyMs, tokensPerSecond }) {
  return (
    <>
      <div className="tele-chip">
        <span>Time to first token</span>
        <span className="tele-val">{latencyMs > 0 ? `${latencyMs} ms` : '—'}</span>
      </div>
      <div className="tele-chip">
        <span>Speed</span>
        <span className="tele-val">
          {tokensPerSecond > 0 ? `~${tokensPerSecond.toFixed(1)} tok/s` : '—'}
        </span>
      </div>
      <div className="progress-track" style={{ height: '3px', borderRadius: '4px' }}>
        <div
          className="progress-fill"
          style={{
            width: tokensPerSecond > 0
              ? `${Math.min(100, (tokensPerSecond / METER_CEILING) * 100)}%`
              : '0%',
            borderRadius: '4px',
          }}
        />
      </div>
    </>
  )
}
