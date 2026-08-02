/**
 * @file MarkdownMessage.jsx
 * @description Renders assistant replies, with copyable syntax-highlighted code.
 */

import { useCallback, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
// The async build fetches each grammar on first use. The synchronous `Prism`
// export bundles every language Prism supports — roughly 600 kB of parsers for
// languages a given reply will never contain.
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-async'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { copyText } from '../../lib/clipboard'
import { PALETTE } from '../../theme'

/**
 * A fenced code block with a language caption and a copy control.
 * Inline code (single backticks) renders as a simple styled span instead.
 */
function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const code = String(children).replace(/\n$/, '')

  const handleCopy = useCallback(async () => {
    if (await copyText(code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [code])

  if (inline || !match) {
    return (
      <code {...props} className={className}>
        {children}
      </code>
    )
  }

  const language = match[1]

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span className="code-block-lang">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="code-block-copy"
          aria-label={`Copy ${language} code`}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        {...props}
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        customStyle={{
          background: PALETTE.void,
          margin: 0,
          padding: '12px 16px',
          fontSize: '11.5px',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

const COMPONENTS = { code: CodeBlock }

/**
 * Renders an assistant message as GitHub-flavoured Markdown.
 * @param {Object} props
 * @param {string} props.children - Markdown source.
 */
export function MarkdownMessage({ children }) {
  return (
    <div className="md-content">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children || ''}
      </Markdown>
    </div>
  )
}
