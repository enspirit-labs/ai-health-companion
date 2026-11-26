import type { Preview } from '@storybook/nextjs-vite';
import { DM_Mono, Instrument_Sans, Lora } from 'next/font/google';

import '../src/app/globals.css';

// Mirrors the font setup in src/app/layout.tsx — the app applies these
// .variable classes (and the theme's `dark` class) to <html>, so stories
// need the same wrapper to render with the real typography/theme tokens
// instead of browser defaults.
const instrumentSans = Instrument_Sans({ variable: '--font-instrument-sans', subsets: ['latin'] });
const dmMono = DM_Mono({ variable: '--font-dm-mono', weight: ['400', '500'], subsets: ['latin'] });
const lora = Lora({ variable: '--font-lora', style: ['italic'], subsets: ['latin'] });

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },

  globalTypes: {
    theme: {
      description: 'Light/dark theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    theme: 'light',
  },

  decorators: [
    (Story, context) => (
      <div
        className={`${instrumentSans.variable} ${dmMono.variable} ${lora.variable} ${
          context.globals.theme === 'dark' ? 'dark' : ''
        } bg-background text-foreground min-h-16 p-6 antialiased`}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
