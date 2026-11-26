import { render } from '@testing-library/react';

import { renderChatMessage } from './render-message';

function html(text: string) {
  return render(<div>{renderChatMessage(text)}</div>).container.innerHTML;
}

describe('renderChatMessage', () => {
  it('returns a single plain paragraph unchanged', () => {
    expect(renderChatMessage('Your scores look steady.')).toBe('Your scores look steady.');
  });

  it('turns dash lines into a bulleted list', () => {
    const { container } = render(<div>{renderChatMessage('Tips:\n- Wake up early\n- Get daylight')}</div>);
    const items = [...container.querySelectorAll('ul > li')].map((li) => li.textContent);
    expect(items).toEqual(['Wake up early', 'Get daylight']);
    expect(container.querySelector('p')?.textContent).toBe('Tips:');
  });

  it('turns numbered lines into an ordered list', () => {
    const { container } = render(<div>{renderChatMessage('1. Stretch\n2. Walk')}</div>);
    expect([...container.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual(['Stretch', 'Walk']);
  });

  it('keeps bold inside list items', () => {
    const { container } = render(<div>{renderChatMessage('- **Light:** get some sun\n- Rest')}</div>);
    expect(container.querySelector('li strong')?.textContent).toBe('Light:');
  });

  it('renders # headings as bold text without the hashes', () => {
    const { container } = render(<div>{renderChatMessage('## Sleep\nA steady rhythm helps.')}</div>);
    expect(container.textContent).not.toContain('#');
    expect(container.querySelector('p.font-semibold')?.textContent).toBe('Sleep');
  });

  it('splits paragraphs on blank lines', () => {
    const { container } = render(<div>{renderChatMessage('First.\n\nSecond.')}</div>);
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['First.', 'Second.']);
  });

  it('never turns reply text into HTML', () => {
    expect(html('- <img src=x onerror=alert(1)>\n- ok')).not.toContain('<img');
  });
});
