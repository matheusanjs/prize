'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');

type ReservationEvent = {
  boatId: string;
  reservation?: any;
  swap?: any;
};

interface Options {
  boatId: string | null;
  token: string | null;
  onCreated?: (e: ReservationEvent) => void;
  onCancelled?: (e: ReservationEvent) => void;
  onUpdated?: (e: ReservationEvent) => void;
  onSwapAccepted?: (e: ReservationEvent) => void;
}

/**
 * useReservationsRealtime — subscribes to the `/reservations` namespace
 * and receives instant events whenever any user creates/cancels/updates
 * a reservation on the selected boat.
 */
export function useReservationsRealtime({ boatId, token, onCreated, onCancelled, onUpdated, onSwapAccepted }: Options) {
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef({ onCreated, onCancelled, onUpdated, onSwapAccepted });

  // Keep callbacks fresh without recreating the socket
  useEffect(() => {
    callbacksRef.current = { onCreated, onCancelled, onUpdated, onSwapAccepted };
  }, [onCreated, onCancelled, onUpdated, onSwapAccepted]);

  useEffect(() => {
    if (!boatId || !token) return;

    const socket = io(`${API_ORIGIN}/reservations`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10_000,
    });
    socketRef.current = socket;

    const handleConnect = () => socket.emit('subscribeBoat', { boatId });
    socket.on('connect', handleConnect);

    socket.on('reservation:created', (e: ReservationEvent) => {
      if (e.boatId === boatId) callbacksRef.current.onCreated?.(e);
    });
    socket.on('reservation:cancelled', (e: ReservationEvent) => {
      if (e.boatId === boatId) callbacksRef.current.onCancelled?.(e);
    });
    socket.on('reservation:updated', (e: ReservationEvent) => {
      if (e.boatId === boatId) callbacksRef.current.onUpdated?.(e);
    });
    socket.on('reservation:swap:accepted', (e: ReservationEvent) => {
      if (e.boatId === boatId) callbacksRef.current.onSwapAccepted?.(e);
    });

    return () => {
      try { socket.emit('unsubscribeBoat', { boatId }); } catch { /* ignore */ }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boatId, token]);
}
