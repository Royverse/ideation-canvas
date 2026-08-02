/**
 * @file useStream.js
 * @description Drives a streaming conversation: sends a turn, appends tokens as
 * they arrive, and lets the user stop generation mid-flight.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from '../api/nvidia'

/**
 * Consumes an async token generator into conversation state.
 *
 * Works with both `streamChat` (which yields plain strings) and
 * `streamReasoning` (which yields `{type, content}` fragments), routing
 * reasoning fragments to a separate `reasoning` field on the message so the UI
 * can show thinking and answer side by side.
 *
 * @param {Function} streamFn - Async generator, e.g. `streamChat` or `streamReasoning`.
 * @param {string} apiKey - NVIDIA NIM API token.
 * @returns {{
 *   messages: Array,
 *   isStreaming: boolean,
 *   error: string|null,
 *   send: (model: string, userMessage: string, params?: Object) => Promise<void>,
 *   stop: () => void,
 *   clearMessages: () => void,
 *   setMessages: Function
 * }} Conversation state and controls.
 */
export function useStream(streamFn, apiKey) {
  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)

  // `send` reads history at call time without listing `messages` as a
  // dependency, which would rebuild the callback on every token.
  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Holds the controller for the request currently in flight, if any.
  const abortRef = useRef(null)

  /** Cancels the active request. Safe to call when nothing is streaming. */
  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  // Abandon any in-flight request when the workspace unmounts.
  useEffect(() => stop, [stop])

  /**
   * Sends one turn and streams the reply into the last assistant message.
   *
   * @param {string} model - Model id to send to.
   * @param {string} userMessage - The user's prompt.
   * @param {Object} [params] - Extra request options. `systemPrompt` is lifted
   *   out and prepended once, at the start of a conversation; everything else
   *   passes through to the API (temperature, max_tokens, …).
   */
  const send = useCallback(async (model, userMessage, params = {}) => {
    if (!apiKey || !model) return

    stop() // Never run two generations into the same transcript.
    const controller = new AbortController()
    abortRef.current = controller

    setIsStreaming(true)
    setError(null)

    const userMsg = { role: 'user', content: userMessage }
    const history = [...messagesRef.current]

    // Show the question and an empty reply together, so the user sees the turn
    // land in one frame rather than two.
    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: 'assistant', content: '', reasoning: '', isStreaming: true },
    ])

    const { systemPrompt, ...apiParams } = params
    if (history.length === 0 && systemPrompt) {
      history.unshift({ role: 'system', content: systemPrompt })
    }

    /** Applies a token to the assistant message currently being written. */
    const appendToReply = (apply) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const next = [...prev]
        const last = { ...next[next.length - 1] }
        apply(last)
        next[next.length - 1] = last
        return next
      })
    }

    try {
      // Strip UI-only fields (`reasoning`, `isStreaming`) before sending.
      const payload = [...history, userMsg].map(({ role, content }) => ({ role, content }))

      const generator = streamFn(apiKey, {
        model,
        messages: payload,
        signal: controller.signal,
        ...apiParams,
      })

      for await (const chunk of generator) {
        if (typeof chunk === 'string') {
          appendToReply((msg) => { msg.content += chunk })
        } else if (chunk.type === 'thinking') {
          appendToReply((msg) => { msg.reasoning += chunk.content })
        } else if (chunk.type === 'answer') {
          appendToReply((msg) => { msg.content += chunk.content })
        }
      }
    } catch (err) {
      // A stop is a deliberate action, not a failure — keep what streamed in.
      if (!isAbortError(err)) setError(err.message)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsStreaming(false)
      appendToReply((msg) => { msg.isStreaming = false })
    }
  }, [apiKey, streamFn, stop])

  /** Clears the transcript, cancelling anything still streaming. */
  const clearMessages = useCallback(() => {
    stop()
    setError(null)
    setMessages([])
  }, [stop])

  return { messages, isStreaming, error, send, stop, clearMessages, setMessages }
}
