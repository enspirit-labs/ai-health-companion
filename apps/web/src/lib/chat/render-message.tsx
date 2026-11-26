import type { ReactNode } from 'react';

import { renderBold } from './render-bold';

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const heading = HEADING.exec(line);

    if (!line.trim()) {
      current = null;
    } else if (heading) {
      blocks.push({ kind: 'heading', text: heading[1] });
      current = null;
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1];
      if (current?.kind === 'list' && current.ordered === ordered) {
        current.items.push(item);
      } else {
        current = { kind: 'list', ordered, items: [item] };
        blocks.push(current);
      }
    } else if (current?.kind === 'paragraph') {
      current.lines.push(line);
    } else {
      current = { kind: 'paragraph', lines: [line] };
      blocks.push(current);
    }
  }
  return blocks;
}

/**
 * Lays out a coach reply as real paragraphs and lists, so `- tip` lines read
 * as a list instead of raw dashes. Only `**bold**`, `#` headings and `-`/`1.`
 * list lines are recognised, and every piece is rendered as React text —
 * never as HTML — so a reply can't inject markup.
 */
export function renderChatMessage(text: string): ReactNode {
  const blocks = toBlocks(text);
  if (blocks.length === 1 && blocks[0].kind === 'paragraph') return renderBold(text.trim());

  return (
    <div className="flex flex-col gap-2 whitespace-normal">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <p key={index} className="font-semibold">
              {renderBold(block.text.replace(/^\*\*(.*)\*\*$/, '$1'))}
            </p>
          );
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List
              key={index}
              className={block.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5 marker:text-primary'}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderBold(item)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderBold(block.lines.join('\n'))}
          </p>
        );
      })}
    </div>
  );
}
