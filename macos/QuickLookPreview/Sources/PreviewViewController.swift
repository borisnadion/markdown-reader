import Cocoa
import QuickLookUI

final class PreviewViewController: NSViewController, QLPreviewingController {
  private var textView: NSTextView!

  override func loadView() {
    let scrollView = NSScrollView()
    scrollView.drawsBackground = true
    scrollView.backgroundColor = .textBackgroundColor
    scrollView.hasVerticalScroller = true
    scrollView.hasHorizontalScroller = false

    textView = NSTextView()
    textView.autoresizingMask = [.width]
    textView.backgroundColor = .textBackgroundColor
    textView.drawsBackground = true
    textView.isEditable = false
    textView.isSelectable = true
    textView.textContainerInset = NSSize(width: 40, height: 36)
    textView.textContainer?.widthTracksTextView = true
    textView.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)

    scrollView.documentView = textView
    view = scrollView
  }

  func preparePreviewOfFile(at url: URL, completionHandler: @escaping ((any Error)?) -> Void) {
    do {
      let markdown = try readMarkdown(at: url)
      let baseDirectory = url.deletingLastPathComponent()
      let html = try renderHTML(
        markdown: markdown,
        title: url.lastPathComponent,
        baseDirectory: baseDirectory
      )

      textView.textStorage?.setAttributedString(try attributedString(fromHTML: html, baseDirectory: baseDirectory))
      completionHandler(nil)
    } catch {
      completionHandler(error)
    }
  }

  private func readMarkdown(at url: URL) throws -> String {
    let data = try Data(contentsOf: url, options: [.mappedIfSafe])

    if let content = String(data: data, encoding: .utf8) {
      return content
    }

    return String(decoding: data, as: UTF8.self)
  }

  private func renderHTML(markdown: String, title: String, baseDirectory: URL) throws -> String {
    let body = renderMarkdown(markdown, baseDirectory: baseDirectory)

    return """
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; media-src file:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none';">
        <title>\(htmlEscaped(title))</title>
        <style>
          :root {
            color-scheme: light dark;
            --preview-bg: #ffffff;
            --preview-fg: #1f2328;
            --preview-muted: #57606a;
            --preview-link: #0969da;
            --preview-border: #d0d7de;
            --preview-code-bg: #f6f8fa;
            --preview-quote: #57606a;
          }

          @media (prefers-color-scheme: dark) {
            :root {
              --preview-bg: #0d1117;
              --preview-fg: #e6edf3;
              --preview-muted: #8b949e;
              --preview-link: #58a6ff;
              --preview-border: #30363d;
              --preview-code-bg: #161b22;
              --preview-quote: #8b949e;
            }
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            background: var(--preview-bg);
            color: var(--preview-fg);
            margin: 0;
            min-height: 100%;
          }

          body {
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 16px;
            line-height: 1.65;
            padding: clamp(24px, 4vw, 48px);
          }

          .markdown-body {
            margin: 0 auto;
            max-width: 900px;
          }

          .markdown-body > :first-child {
            margin-top: 0;
          }

          h1,
          h2,
          h3,
          h4 {
            border-bottom: 1px solid var(--preview-border);
            line-height: 1.25;
            margin: 1.7em 0 0.65em;
            padding-bottom: 0.28em;
          }

          h1 {
            font-size: 2.2rem;
          }

          h2 {
            font-size: 1.55rem;
          }

          h3 {
            font-size: 1.25rem;
          }

          p,
          ul,
          ol,
          blockquote,
          pre,
          table {
            margin: 0 0 1rem;
          }

          a {
            color: var(--preview-link);
          }

          blockquote {
            border-left: 4px solid var(--preview-border);
            color: var(--preview-quote);
            padding-left: 1rem;
          }

          code {
            background: var(--preview-code-bg);
            border-radius: 4px;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
            font-size: 0.88em;
            padding: 0.16em 0.34em;
          }

          pre {
            background: var(--preview-code-bg);
            border: 1px solid var(--preview-border);
            border-radius: 8px;
            overflow: auto;
            padding: 16px;
          }

          pre code {
            background: transparent;
            border-radius: 0;
            padding: 0;
          }

          img {
            border-radius: 6px;
            height: auto;
            max-width: 100%;
          }

          table {
            border-collapse: collapse;
            display: block;
            overflow: auto;
            width: 100%;
          }

          th,
          td {
            border: 1px solid var(--preview-border);
            padding: 8px 12px;
          }

          th {
            background: var(--preview-code-bg);
          }

          hr {
            border: 0;
            border-top: 1px solid var(--preview-border);
            margin: 1.5rem 0;
          }
        </style>
      </head>
      <body>
        <article class="markdown-body">\(body)</article>
      </body>
    </html>
    """
  }

  private func attributedString(fromHTML html: String, baseDirectory: URL) throws -> NSAttributedString {
    let data = Data(html.utf8)
    let rendered = try NSMutableAttributedString(
      data: data,
      options: [
        .documentType: NSAttributedString.DocumentType.html,
        .characterEncoding: String.Encoding.utf8.rawValue,
        .baseURL: baseDirectory
      ],
      documentAttributes: nil
    )

    rendered.addAttribute(
      .foregroundColor,
      value: NSColor.labelColor,
      range: NSRange(location: 0, length: rendered.length)
    )

    return rendered
  }

  private func renderMarkdown(_ markdown: String, baseDirectory: URL) -> String {
    let lines = markdown.replacingOccurrences(of: "\r\n", with: "\n").split(
      separator: "\n",
      omittingEmptySubsequences: false
    ).map(String.init)

    var blocks: [String] = []
    var paragraph: [String] = []
    var listItems: [String] = []
    var listKind: String?
    var quoteLines: [String] = []
    var codeLines: [String] = []
    var isInCodeBlock = false
    var codeLanguage = ""

    func flushParagraph() {
      guard !paragraph.isEmpty else { return }
      let text = paragraph.joined(separator: " ")
      blocks.append("<p>\(renderInline(text, baseDirectory: baseDirectory))</p>")
      paragraph.removeAll()
    }

    func flushList() {
      guard let currentListKind = listKind, !listItems.isEmpty else { return }
      blocks.append("<\(currentListKind)>\(listItems.joined())</\(currentListKind)>")
      listItems.removeAll()
      listKind = nil
    }

    func flushQuote() {
      guard !quoteLines.isEmpty else { return }
      let quote = quoteLines.joined(separator: " ")
      blocks.append("<blockquote><p>\(renderInline(quote, baseDirectory: baseDirectory))</p></blockquote>")
      quoteLines.removeAll()
    }

    func flushOpenBlocks() {
      flushParagraph()
      flushList()
      flushQuote()
    }

    for line in lines {
      let trimmed = line.trimmingCharacters(in: .whitespaces)

      if trimmed.hasPrefix("```") {
        if isInCodeBlock {
          blocks.append(renderCodeBlock(codeLines.joined(separator: "\n"), language: codeLanguage))
          codeLines.removeAll()
          codeLanguage = ""
          isInCodeBlock = false
        } else {
          flushOpenBlocks()
          codeLanguage = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
          isInCodeBlock = true
        }
        continue
      }

      if isInCodeBlock {
        codeLines.append(line)
        continue
      }

      if trimmed.isEmpty {
        flushOpenBlocks()
        continue
      }

      if trimmed == "---" || trimmed == "***" || trimmed == "___" {
        flushOpenBlocks()
        blocks.append("<hr>")
        continue
      }

      if let heading = parseHeading(trimmed) {
        flushOpenBlocks()
        blocks.append("<h\(heading.level)>\(renderInline(heading.text, baseDirectory: baseDirectory))</h\(heading.level)>")
        continue
      }

      if trimmed.hasPrefix(">") {
        flushParagraph()
        flushList()
        quoteLines.append(String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces))
        continue
      }

      if let unordered = parseUnorderedListItem(trimmed) {
        flushParagraph()
        flushQuote()
        if listKind != "ul" {
          flushList()
          listKind = "ul"
        }
        listItems.append("<li>\(renderInline(unordered, baseDirectory: baseDirectory))</li>")
        continue
      }

      if let ordered = parseOrderedListItem(trimmed) {
        flushParagraph()
        flushQuote()
        if listKind != "ol" {
          flushList()
          listKind = "ol"
        }
        listItems.append("<li>\(renderInline(ordered, baseDirectory: baseDirectory))</li>")
        continue
      }

      flushList()
      flushQuote()
      paragraph.append(trimmed)
    }

    if isInCodeBlock {
      blocks.append(renderCodeBlock(codeLines.joined(separator: "\n"), language: codeLanguage))
    }

    flushOpenBlocks()

    return blocks.joined(separator: "\n")
  }

  private func parseHeading(_ line: String) -> (level: Int, text: String)? {
    let markerCount = line.prefix(while: { $0 == "#" }).count

    guard markerCount > 0, markerCount <= 6 else { return nil }

    let index = line.index(line.startIndex, offsetBy: markerCount)
    guard index < line.endIndex, line[index] == " " else { return nil }

    let text = String(line[line.index(after: index)...]).trimmingCharacters(in: .whitespaces)
    return (markerCount, text)
  }

  private func parseUnorderedListItem(_ line: String) -> String? {
    for marker in ["- ", "* ", "+ "] {
      if line.hasPrefix(marker) {
        return String(line.dropFirst(marker.count)).trimmingCharacters(in: .whitespaces)
      }
    }

    return nil
  }

  private func parseOrderedListItem(_ line: String) -> String? {
    guard let dot = line.firstIndex(of: ".") else { return nil }

    let prefix = line[..<dot]
    guard !prefix.isEmpty, prefix.allSatisfy(\.isNumber) else { return nil }

    let afterDot = line.index(after: dot)
    guard afterDot < line.endIndex, line[afterDot] == " " else { return nil }

    return String(line[line.index(after: afterDot)...]).trimmingCharacters(in: .whitespaces)
  }

  private func renderCodeBlock(_ code: String, language: String) -> String {
    let languageClass = language.isEmpty ? "" : " class=\"language-\(attributeEscaped(language))\""
    return "<pre><code\(languageClass)>\(htmlEscaped(code))</code></pre>"
  }

  private func renderInline(_ value: String, baseDirectory: URL) -> String {
    var output = ""
    var remaining = value[...]

    while !remaining.isEmpty {
      if remaining.hasPrefix("!["),
         let closeBracket = remaining.firstIndex(of: "]"),
         closeBracket < remaining.index(before: remaining.endIndex),
         remaining[remaining.index(after: closeBracket)] == "(",
         let closeParen = remaining[remaining.index(after: closeBracket)...].firstIndex(of: ")") {
        let altStart = remaining.index(remaining.startIndex, offsetBy: 2)
        let alt = String(remaining[altStart..<closeBracket])
        let urlStart = remaining.index(closeBracket, offsetBy: 2)
        let rawURL = String(remaining[urlStart..<closeParen])

        if let imageURL = resolveLocalImageURL(rawURL, baseDirectory: baseDirectory) {
          output += "<img src=\"\(attributeEscaped(imageURL.absoluteString))\" alt=\"\(attributeEscaped(alt))\">"
        } else {
          output += htmlEscaped(alt)
        }

        remaining = remaining[remaining.index(after: closeParen)...]
        continue
      }

      if remaining.hasPrefix("`"),
         let closeTick = remaining.dropFirst().firstIndex(of: "`") {
        let code = String(remaining[remaining.index(after: remaining.startIndex)..<closeTick])
        output += "<code>\(htmlEscaped(code))</code>"
        remaining = remaining[remaining.index(after: closeTick)...]
        continue
      }

      let character = remaining.removeFirst()
      output += htmlEscaped(String(character))
    }

    return output
  }

  private func resolveLocalImageURL(_ rawValue: String, baseDirectory: URL) -> URL? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !trimmed.isEmpty,
          !trimmed.contains(":"),
          !trimmed.hasPrefix("//"),
          !trimmed.hasPrefix("/")
    else {
      return nil
    }

    let resolved = baseDirectory.appendingPathComponent(trimmed).standardizedFileURL
    let basePath = baseDirectory.standardizedFileURL.path
    let resolvedPath = resolved.path

    guard resolvedPath == basePath || resolvedPath.hasPrefix(basePath + "/") else {
      return nil
    }

    return resolved
  }

  private func htmlEscaped(_ value: String) -> String {
    value
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
  }

  private func attributeEscaped(_ value: String) -> String {
    htmlEscaped(value)
      .replacingOccurrences(of: "'", with: "&#39;")
  }
}
