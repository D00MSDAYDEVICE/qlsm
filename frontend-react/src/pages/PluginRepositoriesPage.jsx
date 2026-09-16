import React, { useState, useEffect, useCallback } from 'react';
import {
  PackagePlus, AlertCircle, Loader2,
} from 'lucide-react';
import {
  getPluginRepositories,
  createPluginRepository,
  syncPluginRepository,
  deletePluginRepository,
} from '../services/api';
import { useNotification } from '../components/NotificationProvider';
import ConfirmationModal from '../components/ConfirmationModal';
import AddPluginRepositoryModal from '../components/pluginRepositories/AddPluginRepositoryModal';
import PluginRepositoryCard from '../components/pluginRepositories/PluginRepositoryCard';

function PluginRepositoriesPage() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState(null);
  const [syncingId, setSyncingId] = useState(null);

  const { showSuccess, showError } = useNotification();

  // `silent` refreshes the list without flipping `loading`. The loading branch
  // replaces every card with a spinner, which unmounts them and throws away
  // card-local state -- including the overwrite confirm a partial download has
  // just raised, and any expanded card.
  const fetchRepos = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getPluginRepositories();
      setRepos(data || []);
    } catch (err) {
      setError(err.error?.message || err.message || 'Failed to fetch plugin repositories.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRepos(); }, [fetchRepos]);

  const handleCreateRepository = async (repoData) => {
    await createPluginRepository(repoData);
    showSuccess(`Repository "${repoData.name}" added.`);
    fetchRepos();
  };

  const handleSync = async (repo) => {
    setSyncingId(repo.id);
    try {
      await syncPluginRepository(repo.id);
      showSuccess(`Synced "${repo.name}".`);
    } catch (err) {
      showError(err.error?.message || err.message || `Failed to sync "${repo.name}".`);
    } finally {
      setSyncingId(null);
      fetchRepos();
    }
  };

  const handleDeleteRepository = async () => {
    if (!selectedForDelete) return;
    try {
      await deletePluginRepository(selectedForDelete.id);
      showSuccess(`Repository "${selectedForDelete.name}" deleted.`);
      fetchRepos();
    } catch (err) {
      showError(err.error?.message || err.message || 'Failed to delete repository.');
    }
    setIsDeleteModalOpen(false);
    setSelectedForDelete(null);
  };

  const openDeleteModal = (repo) => {
    setSelectedForDelete(repo);
    setIsDeleteModalOpen(true);
  };

  if (error) {
    return (
      <div className="users-page">
        <div className="users-page-header">
          <div className="users-page-title-row">
            <div className="users-page-title-wrapper">
              <PackagePlus className="users-page-title-icon" strokeWidth={2} />
              <h1 className="users-page-title">Plugin Repositories</h1>
            </div>
          </div>
        </div>
        <div className="users-error-state">
          <AlertCircle size={24} strokeWidth={2} style={{ color: 'var(--accent-danger)' }} />
          <p className="users-error-text">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-page">
      <div className="users-page-header">
        <div className="users-page-title-row">
          <div className="users-page-title-wrapper">
            <PackagePlus className="users-page-title-icon" strokeWidth={2} />
            <h1 className="users-page-title">Plugin Repositories</h1>
            {!loading && (
              <span className="users-page-count">{repos.length}</span>
            )}
          </div>
          <button onClick={() => setIsAddModalOpen(true)} className="users-add-btn">
            <PackagePlus size={18} strokeWidth={2} />
            <span>Add Repository</span>
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          External sources of minqlx plugins. Downloading a plugin copies it into the local pool
          (ql-assets/data), the same place bundled plugins live — it's picked up wherever that pool
          already is, no different from one qlsm ships itself.
        </p>
      </div>

      {loading ? (
        <div className="users-loading-state">
          <Loader2 className="users-loading-spinner" strokeWidth={2} />
          <span className="users-loading-text">Loading repositories...</span>
        </div>
      ) : repos.length === 0 ? (
        <div className="users-empty-state">
          <PackagePlus size={32} strokeWidth={1.5} className="users-empty-icon" />
          <p className="users-empty-text">No plugin repositories added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {repos.map((repo) => (
            <PluginRepositoryCard
              key={repo.id}
              repo={repo}
              syncing={syncingId === repo.id}
              onSync={handleSync}
              onDelete={openDeleteModal}
              onDownloaded={() => fetchRepos({ silent: true })}
            />
          ))}
        </div>
      )}

      <AddPluginRepositoryModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleCreateRepository}
      />

      {selectedForDelete && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedForDelete(null);
          }}
          onConfirm={handleDeleteRepository}
          title="Delete Plugin Repository"
          message={`Are you sure you want to remove "${selectedForDelete.name}"? Plugins already downloaded from it stay in the local pool.`}
          confirmButtonText="Delete"
          confirmButtonVariant="danger"
        />
      )}
    </div>
  );
}

export default PluginRepositoriesPage;
