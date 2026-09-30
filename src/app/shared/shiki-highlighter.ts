import bash from '@shikijs/langs/bash';
import dockerfile from '@shikijs/langs/dockerfile';
import html from '@shikijs/langs/html';
import javascript from '@shikijs/langs/javascript';
import json from '@shikijs/langs/json';
import powershell from '@shikijs/langs/powershell';
import typescript from '@shikijs/langs/typescript';
import yaml from '@shikijs/langs/yaml';
import darkPlus from '@shikijs/themes/dark-plus';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export type CodeLanguage =
  'bash' | 'dockerfile' | 'html' | 'javascript' | 'json' | 'powershell' | 'typescript' | 'yaml';

export interface HighlightedCode {
  readonly background: string;
  readonly foreground: string;
  readonly lines: readonly (readonly { readonly color: string; readonly content: string }[])[];
}

const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [bash, dockerfile, html, javascript, json, powershell, typescript, yaml],
  themes: [darkPlus],
});

export async function highlightCode(
  code: string,
  language: CodeLanguage,
): Promise<HighlightedCode> {
  const instance = await highlighter;
  const result = instance.codeToTokens(code, {
    lang: language,
    theme: 'dark-plus',
  });
  const background = result.bg ?? '#1e1e1e';
  const foreground = result.fg ?? '#d4d4d4';

  return {
    background,
    foreground,
    lines: result.tokens.map((line) =>
      line.map((token) => ({
        color: token.color ?? foreground,
        content: token.content,
      })),
    ),
  };
}
