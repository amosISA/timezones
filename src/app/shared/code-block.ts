import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import type { CodeLanguage, HighlightedCode } from './shiki-highlighter';

const plainCode = (code: string): HighlightedCode => ({
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  lines: code.split('\n').map((line) => [{ color: '#d4d4d4', content: line || ' ' }]),
});

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-code-block',
  template: `
    <pre
      [attr.aria-label]="label()"
      [style.background-color]="highlighted().background"
      [style.color]="highlighted().foreground"
    ><code>@for (line of highlighted().lines; track $index) {<span class="line">@for (token of line; track $index) {<span [style.color]="token.color">{{ token.content }}</span>}</span>}</code></pre>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    pre {
      overflow-x: auto;
      margin: 0;
      padding: 0.85rem;
      border: 1px solid rgb(51 65 85 / 0.8);
      border-radius: 0.5rem;
      font-size: 0.75rem;
      line-height: 1.55;
      tab-size: 2;
    }

    code,
    .line {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .line {
      display: block;
      min-height: 1.55em;
    }
  `,
})
export class CodeBlock {
  readonly code = input.required<string>();
  readonly label = input('Code example');
  readonly language = input<CodeLanguage>('typescript');

  protected readonly highlighted = signal<HighlightedCode>(plainCode(''));
  private revision = 0;

  constructor() {
    effect(() => {
      const code = this.code();
      const language = this.language();
      const revision = ++this.revision;
      this.highlighted.set(plainCode(code));

      void import('./shiki-highlighter')
        .then(({ highlightCode }) => highlightCode(code, language))
        .then((result) => {
          if (revision === this.revision) {
            this.highlighted.set(result);
          }
        })
        .catch(() => undefined);
    });
  }
}
