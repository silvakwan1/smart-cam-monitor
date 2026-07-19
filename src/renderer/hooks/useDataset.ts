import { useState, useEffect, useCallback, useMemo } from 'react';
import { datasetService } from '../services/datasetService';
import { DatasetClass, DatasetImage } from '../../shared/types';

export function useDataset() {
  const [classes, setClasses] = useState<DatasetClass[]>([]);
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<string>('');
  const [isTraining, setIsTraining] = useState(false);
  
  // Training parameters state
  const [epochs, setEpochs] = useState<number>(50);
  const [batchSize, setBatchSize] = useState<number>(8);
  const [device, setDevice] = useState<string>('auto');

  // Modal / Lightbox states
  const [activeImage, setActiveImage] = useState<DatasetImage | null>(null);
  const [deleteConfirmImage, setDeleteConfirmImage] = useState<DatasetImage | null>(null);
  const [deleteConfirmClass, setDeleteConfirmClass] = useState<DatasetClass | null>(null);

  const fetchDataset = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await datasetService.getDatasetData();
      setClasses(data.classes);
      setImages(data.images);
    } catch (err) {
      console.error('Failed to load dataset details:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  const handleDeleteImage = useCallback(async (image: DatasetImage) => {
    try {
      await datasetService.deleteDatasetImage(image.path);
      setDeleteConfirmImage(null);
      await fetchDataset();
    } catch (err) {
      console.error('Failed to delete image:', err);
      alert('Erro ao deletar imagem.');
    }
  }, [fetchDataset]);

  const handleDeleteClass = useCallback(async (cls: DatasetClass) => {
    try {
      await datasetService.deleteDatasetClass(cls.id, cls.name);
      setDeleteConfirmClass(null);
      if (selectedClassId === cls.id) {
        setSelectedClassId(null);
      }
      await fetchDataset();
    } catch (err) {
      console.error('Failed to delete class:', err);
      alert('Erro ao excluir a classe.');
    }
  }, [selectedClassId, fetchDataset]);

  const handleStartTraining = useCallback(async () => {
    // Basic verification
    const totalImages = images.length;
    if (totalImages < 10) {
      setTrainingStatus('Aviso: Recomenda-se pelo menos 10 imagens no dataset antes do treinamento.');
    }

    setIsTraining(true);
    setTrainingStatus('Preparando ambiente e iniciando treinamento...');

    try {
      const result = await datasetService.startDatasetTrainer({
        epochs,
        batch: batchSize,
        device
      });

      if (result.success) {
        setTrainingStatus('Treinador iniciado! Acompanhe o progresso na janela do terminal que foi aberta.');
      } else {
        setTrainingStatus(result.message || 'Falha ao iniciar o treinamento.');
      }
    } catch (err) {
      setTrainingStatus(err instanceof Error ? err.message : 'Não foi possível iniciar o treinamento.');
    } finally {
      setIsTraining(false);
    }
  }, [images.length, epochs, batchSize, device]);

  // Filtered images based on selection
  const filteredImages = useMemo(() => {
    return selectedClassId !== null
      ? images.filter(img => img.classId === selectedClassId)
      : images;
  }, [images, selectedClassId]);

  return {
    classes,
    images,
    selectedClassId,
    setSelectedClassId,
    isLoading,
    trainingStatus,
    isTraining,
    epochs,
    setEpochs,
    batchSize,
    setBatchSize,
    device,
    setDevice,
    activeImage,
    setActiveImage,
    deleteConfirmImage,
    setDeleteConfirmImage,
    deleteConfirmClass,
    setDeleteConfirmClass,
    filteredImages,
    fetchDataset,
    handleDeleteImage,
    handleDeleteClass,
    handleStartTraining
  };
}
