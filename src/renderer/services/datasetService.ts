import { DatasetClass, DatasetImage } from '../../shared/types';

export const datasetService = {
  async getDatasetData(): Promise<{ classes: DatasetClass[]; images: DatasetImage[] }> {
    return window.electronAPI.getDatasetData();
  },

  async deleteDatasetImage(path: string): Promise<{ success: boolean }> {
    return window.electronAPI.deleteDatasetImage(path);
  },

  async deleteDatasetClass(classId: number, className: string): Promise<{ success: boolean }> {
    return window.electronAPI.deleteDatasetClass(classId, className);
  },

  async startDatasetTrainer(config: { epochs: number; batch: number; device: string }): Promise<{ success: boolean; message?: string }> {
    return window.electronAPI.startDatasetTrainer(config);
  }
};
