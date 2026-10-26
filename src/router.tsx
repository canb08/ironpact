import { createBrowserRouter } from 'react-router';

export const router = createBrowserRouter([
  { path: '/', element: <main>SPOTTER</main> },
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/ui',
          lazy: async () => ({ Component: (await import('./ui/DevUi')).default }),
        },
      ]
    : []),
]);
