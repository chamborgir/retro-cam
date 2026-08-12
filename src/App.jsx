import { useCallback, useState } from 'react';
import CameraView from './components/CameraView';
import PhotoPreviewModal from './components/PhotoPreviewModal';

const ROLL_LENGTH = 36; // classic 35mm roll size, purely cosmetic

export default function App() {
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [framesLeft, setFramesLeft] = useState(ROLL_LENGTH);

  const handleCapture = useCallback(({ dataUrl, meta }) => {
    setCapturedPhoto({ dataUrl, meta });
    setFramesLeft((n) => Math.max(0, n - 1));
  }, []);

  return (
    <div className="no-scroll bg-body-black">
      <CameraView onCapture={handleCapture} framesLeft={framesLeft} disabled={framesLeft <= 0} />
      {capturedPhoto && (
        <PhotoPreviewModal
          photo={capturedPhoto.dataUrl}
          meta={capturedPhoto.meta}
          onClose={() => setCapturedPhoto(null)}
        />
      )}
    </div>
  );
}
