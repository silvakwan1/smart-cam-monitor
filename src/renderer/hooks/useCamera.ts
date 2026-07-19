import { useEffect } from 'react';
import { useCameraStore } from '../stores/cameraStore';
import { useEventStore } from '../stores/eventStore';

export function useCamera() {
  const setFrameData = useCameraStore((state) => state.setFrameData);
  const setStatus = useCameraStore((state) => state.setStatus);
  const setSystemStats = useCameraStore((state) => state.setSystemStats);
  const addEvent = useEventStore((state) => state.addEvent);

  useEffect(() => {
    // Register IPC listeners and cache their cleanup destructors
    const unsubscribeFrame = window.electronAPI.onFrame((_event, data) => {
      setFrameData(data.base64Frame, data.detections, data.stats);
    });

    const unsubscribeStatus = window.electronAPI.onStatus((_event, status) => {
      setStatus(status as any);
    });

    const unsubscribeStats = window.electronAPI.onStats((_event, stats) => {
      setSystemStats(stats);
    });

    const unsubscribeEvents = window.electronAPI.onSystemEvent((_event, sysEvent) => {
      addEvent(sysEvent);
    });

    // Clean up all IPC bindings on component unmount
    return () => {
      unsubscribeFrame();
      unsubscribeStatus();
      unsubscribeStats();
      unsubscribeEvents();
    };
  }, [setFrameData, setStatus, setSystemStats, addEvent]);
}
