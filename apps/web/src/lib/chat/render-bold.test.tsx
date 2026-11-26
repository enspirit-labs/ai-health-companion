import { render } from '@testing-library/react';

import { renderBold } from './render-bold';

function html(text: string) {
  return render(<p>{renderBold(text)}</p>).container.innerHTML;
}

describe('renderBold', () => {
  it('turns **text** into bold text without the asterisks', () => {
    expect(html('**Keep a steady rhythm**\n- Wake up at the same time')).toBe(
      '<p><strong>Keep a steady rhythm</strong>\n- Wake up at the same time</p>',
    );
  });

  it('handles several bold spans in one reply', () => {
    expect(html('Try **less screen time** and **more daylight**.')).toBe(
      '<p>Try <strong>less screen time</strong> and <strong>more daylight</strong>.</p>',
    );
  });

  it('returns plain text unchanged', () => {
    expect(renderBold('No formatting here.')).toBe('No formatting here.');
  });

  it('leaves unmatched or line-spanning asterisks as they are', () => {
    expect(html('2 ** 3 and **open\nclose**')).toBe('<p>2 ** 3 and **open\nclose**</p>');
  });

  it('never turns reply text into HTML', () => {
    expect(html('**<img src=x onerror=alert(1)>**')).toBe(
      '<p><strong>&lt;img src=x onerror=alert(1)&gt;</strong></p>',
    );
  });
});
