/**
 * @file useStream.js
 * @description Custom React hook managing real-time chat and reasoning stream states.
 * Orchestrates sending queries, maintaining history, appending partial token streams,
 * and handling connection lifetimes.
 */

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Custom hook to consume and manage an asynchronous token generator stream.
 * 
 * @param {Function} streamFn - Asynchronous generator function (e.g. streamChat or streamReasoning).
 * @param {string} apiKey - The active user authorization key.
 * @returns {Object} Object containing message history, streaming states, sender callbacks, and resetters.
 */
export function useStream(streamFn, apiKey) {
  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)

  // Maintain a mutable ref pointing to the latest state
  // This allows the stale-closure-free callback 'send' to read current messages
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  /**
   * Dispatches a message payload, initializes placeholders, and streams responses.
   * 
   * @param {string} model - Target model identifier.
   * @param {string} userMessage - Prompt content.
   * @param {Object} extraParams - Settings like temperature, max_tokens, or systemPrompt.
   */
  const send = useCallback(async (model, userMessage, extraParams = {}) => {
    if (!apiKey) return
    
    setIsStreaming(true)
    setError(null)
    
    const userMsg = { role: 'user', content: userMessage }
    const aiMsg = { role: 'assistant', content: '', reasoning: '', isStreaming: true }
    
    // Capture state immediately before adding new items
    const history = [...messagesRef.current]
    
    // Add user question and empty AI bubble simultaneously to optimize render passes
    setMessages(prev => [...prev, userMsg, aiMsg])

    const { systemPrompt, ...apiParams } = extraParams
    // Inject system instructions if history is empty
    if (history.length === 0 && systemPrompt) {
      history.push({ role: 'system', content: systemPrompt })
    }
    
    try {
      // Map history to standard API payload parameters, removing local state variables
      const cleanedMessages = [...history, userMsg].map(({ role, content }) => ({ role, content }))

      const generator = streamFn(apiKey, { 
        model, 
        messages: cleanedMessages,
        ...apiParams
      })

      // Standard generator consumption block
      for await (const chunk of generator) {
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMsg = { ...newMessages[newMessages.length - 1] }
          
          if (typeof chunk === 'string') {
            // Standard Chat completions (raw text tokens)
            lastMsg.content += chunk
          } else if (chunk.type === 'thinking') {
            // Reasoning steps (DeepSeek <think> chunks)
            lastMsg.reasoning += chunk.content
          } else if (chunk.type === 'answer') {
            // Reasoning responses (DeepSeek answer chunks)
            lastMsg.content += chunk.content
          }
          
          newMessages[newMessages.length - 1] = lastMsg
          return newMessages
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsStreaming(false)
      // Toggle final streaming states on the active assistant message card
      setMessages(prev => {
        const newMessages = [...prev]
        const lastMsg = { ...newMessages[newMessages.length - 1] }
        lastMsg.isStreaming = false
        newMessages[newMessages.length - 1] = lastMsg
        return newMessages
      })
    }
  }, [apiKey, streamFn])

  /**
   * Empties the current conversation state array.
   */
  const clearMessages = () => setMessages([])

  return { messages, isStreaming, error, send, clearMessages, setMessages }
}
