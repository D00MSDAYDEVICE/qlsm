import React from 'react';
import ConfirmationModal from '../ConfirmationModal';
import { useQlsmRestart } from '../../hooks/useQlsmRestart';

/**
 * Warning (yellow) confirmation shown right after an addon is installed: the
 * addon is inert until QLSM restarts. Offers the restart itself only where one
 * is survivable (see useQlsmRestart); otherwise it is a plain acknowledgement.
 */
function AddonRestartModal({ isOpen, onClose }) {
  const { supported, restart } = useQlsmRestart();

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={supported ? restart : () => {}}
      title="Restart required"
      message={
        'An addon was installed. QLSM needs a restart before it takes effect.'
        + (supported ? ' The interface is unavailable for a few seconds; game servers QLSM manages are not touched.' : '')
      }
      confirmButtonText={supported ? 'Restart QLSM' : 'OK'}
      cancelButtonText="Later"
      showCancel={supported}
      confirmButtonVariant="warning"
    />
  );
}

export default AddonRestartModal;
