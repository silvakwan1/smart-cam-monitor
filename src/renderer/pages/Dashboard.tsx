import React, { useEffect } from 'react';
import { CameraView } from '../components/CameraView';
import { ControlPanel } from '../components/ControlPanel';
import { EventHistory } from '../components/EventHistory';
import { useCamera } from '../hooks/useCamera';
import { useCameraStore } from '../stores/cameraStore';
import { useEventStore } from '../stores/eventStore';

export const Dashboard: React.FC = () => {
  // Activate global IPC listeners for frames, status updates, system events, and metrics
  useCamera();

  const fetchCameras = useCameraStore((state) => state.fetchCameras);
  const fetchEvents = useEventStore((state) => state.fetchEvents);

  useEffect(() => {
    fetchCameras();
    fetchEvents();
  }, [fetchCameras, fetchEvents]);

  const isFullscreen = useCameraStore((state) => state.isFullscreen);

  return (
    <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${isFullscreen ? 'p-0 space-y-0' : 'space-y-4 p-4'}`}>
      {/* Upper viewport: Streaming feed & panel */}
      <div className={`flex-1 flex min-h-0 overflow-hidden ${isFullscreen ? '' : 'space-x-4'}`}>
        <CameraView />
        {!isFullscreen && <ControlPanel />}
      </div>

      {/* Timeline logs section */}
      {!isFullscreen && <EventHistory />}
    </div>
  );
};
