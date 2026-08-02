/**
 * @file useStreamTelemetry.js
 * @description Measures real latency and throughput for a streaming response.
 */

import { useEffect, useRef, useState } from 'react'

/** Characters per token, averaged across English text for these tokenizers. */
const CHARS_PER_TOKEN = 4

/** Ignore throughput below this much elapsed time — the figure is still noise. */
const MIN_SAMPLE_SECONDS = 0.25

/**
 * Measures time-to-first-token and generation throughput, live.
 *
 * Throughput is measured from the first token onward, not from the request
 * leaving: folding queue time into a generation-speed number understates it,
 * sometimes badly on a cold model. Both readings update as tokens arrive and
 * hold their final value once the stream ends.
 *
 * Token counts are estimated from character length — a streaming response
 * carries no usage block, so there is no exact count to report.
 *
 * @param {Array} messages - Conversation history from `useStream`.
 * @param {boolean} isStreaming - Whether a generation is running.
 * @returns {{latencyMs: number, tokensPerSecond: number}} Latest readings.
 */
export function useStreamTelemetry(messages, isStreaming) {
  const [latencyMs, setLatencyMs] = useState(0)
  const [tokensPerSecond, setTokensPerSecond] = useState(0)

  const requestStartRef = useRef(null)
  const firstTokenAtRef = useRef(null)

  // Latch the start of each run. The readings from the previous run stay on
  // screen until the new one produces its own, so the panel never blinks empty.
  useEffect(() => {
    if (!isStreaming) return
    requestStartRef.current = performance.now()
    firstTokenAtRef.current = null
  }, [isStreaming])

  useEffect(() => {
    if (!isStreaming || !requestStartRef.current) return

    const last = messages[messages.length - 1]
    if (last?.role !== 'assistant') return

    const chars = (last.content?.length ?? 0) + (last.reasoning?.length ?? 0)
    if (chars === 0) return

    const now = performance.now()
    if (!firstTokenAtRef.current) {
      firstTokenAtRef.current = now
      setLatencyMs(Math.round(now - requestStartRef.current))
    }

    const seconds = (now - firstTokenAtRef.current) / 1000
    if (seconds >= MIN_SAMPLE_SECONDS) {
      setTokensPerSecond(chars / CHARS_PER_TOKEN / seconds)
    }
  }, [messages, isStreaming])

  return { latencyMs, tokensPerSecond }
}
