import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { CreateRidePage } from '@/pages/CreateRidePage';
import { JoinRidePage } from '@/pages/JoinRidePage';
import { RidePage } from '@/pages/RidePage';

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
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
