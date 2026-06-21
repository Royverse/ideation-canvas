import { useState, useCallback, useRef, useEffect } from 'react'

export function useStream(streamFn, apiKey) {
  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)

  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const send = useCallback(async (model, userMessage, extraParams = {}) => {
    if (!apiKey) return
    
    setIsStreaming(true)
    setError(null)
    
    const userMsg = { role: 'user', content: userMessage }
    const aiMsg = { role: 'assistant', content: '', reasoning: '', isStreaming: true }
    
    // Capture history before appending
    const history = [...messagesRef.current]
    
    // Add both user message and placeholder in one render cycle
    setMessages(prev => [...prev, userMsg, aiMsg])

    const { systemPrompt, ...apiParams } = extraParams
    if (history.length === 0 && systemPrompt) {
      history.push({ role: 'system', content: systemPrompt })
    }
    
    try {
      const cleanedMessages = [...history, userMsg].map(({ role, content }) => ({ role, content }))

      const generator = streamFn(apiKey, { 
        model, 
        messages: cleanedMessages,
        ...apiParams
      })

      for await (const chunk of generator) {
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMsg = { ...newMessages[newMessages.length - 1] }
          
          if (typeof chunk === 'string') {
            lastMsg.content += chunk
          } else if (chunk.type === 'thinking') {
            lastMsg.reasoning += chunk.content
          } else if (chunk.type === 'answer') {
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
      setMessages(prev => {
        const newMessages = [...prev]
        const lastMsg = { ...newMessages[newMessages.length - 1] }
        lastMsg.isStreaming = false
        newMessages[newMessages.length - 1] = lastMsg
        return newMessages
      })
    }
  }, [apiKey, streamFn])

  const clearMessages = () => setMessages([])

  return { messages, isStreaming, error, send, clearMessages, setMessages }
}

