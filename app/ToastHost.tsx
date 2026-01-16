'use client';

import { useToast } from '@/app/hooks/useToast';

export default function ToastHost() {
  const { ToastContainer } = useToast();
  return <ToastContainer />;
}