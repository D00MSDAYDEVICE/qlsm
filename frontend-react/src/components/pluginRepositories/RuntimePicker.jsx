import React, { Fragment } from 'react';
import { Listbox, Transition, Portal } from '@headlessui/react';
import { useFloating, shift, offset, autoUpdate, flip } from '@floating-ui/react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { RUNTIME_OPTIONS } from '../../constants/runtimes';

// Compact runtime pick for a repository plugin that declares none. Styled to
// match HostActionsMenu: a muted text trigger and a floating panel of items.
function RuntimePicker({ value, onChange, ariaLabel }) {
  const { x, y, refs, strategy } = useFloating({
    placement: 'bottom-start',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  return (
    <Listbox value={value || ''} onChange={onChange}>
      {({ open }) => (
        <>
          <Listbox.Button
            ref={refs.setReference}
            aria-label={ariaLabel}
            className={`-ml-2.5 -my-1.5 inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 font-mono text-xs rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus:outline-none transition-all ${
              value ? 'text-theme-primary' : 'text-theme-muted hover:text-theme-secondary'
            } ${open ? 'bg-black/[0.04] dark:bg-white/[0.04]' : ''}`}
          >
            {value || 'pick runtime'}
            <ChevronDown size={13} className="flex-shrink-0 text-theme-muted" aria-hidden="true" />
          </Listbox.Button>
          <Portal>
            <Transition
              as={Fragment}
              show={open}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Listbox.Options
                ref={refs.setFloating}
                style={{
                  position: strategy,
                  top: y ?? 0,
                  left: x ?? 0,
                  background: 'var(--surface-raised)',
                  borderColor: 'var(--surface-border)',
                }}
                className="z-20 w-44 rounded-lg shadow-lg border focus:outline-none overflow-hidden px-1 py-1"
              >
                {RUNTIME_OPTIONS.map((opt) => (
                  <Listbox.Option
                    key={opt.id}
                    value={opt.id}
                    className={({ active }) =>
                      `flex rounded-md items-center w-full px-3 py-2 text-sm font-mono cursor-default transition-colors ${
                        active ? 'bg-black/[0.04] dark:bg-white/[0.06] text-theme-primary' : 'text-theme-secondary'
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className="flex-1">{opt.name}</span>
                        {selected && <Check size={14} style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </Portal>
        </>
      )}
    </Listbox>
  );
}

export default RuntimePicker;
