import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouteObject } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { CreateRidePage } from '@/pages/CreateRidePage';
import { JoinRidePage } from '@/pages/JoinRidePage';
import { RidePage } from '@/pages/RidePage';

// GPS ride simulator for local development only — stripped from production builds
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? (() => {
      const RidePlayground = lazy(() => import('@/dev/RidePlayground'));
      return [
        {
          path: '/dev/ride',
          element: (
            <Suspense fallback={null}>
              <RidePlayground />
            </Suspense>
          ),
        },
      ];
    })()
  : [];

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/create',
    element: <CreateRidePage />,
  },
  {
    path: '/join',
    element: <JoinRidePage />,
  },
  {
    path: '/ride/:rideId',
    element: <RidePage />,
  },
  ...devRoutes,
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
