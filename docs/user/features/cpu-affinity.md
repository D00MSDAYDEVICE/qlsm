# CPU Affinity

CPU affinity pins a Quake Live server process to one CPU core on its host. QLSM assigns it for you, and the instance details panel shows the result in the **CPU Affinity** field.

## Why It Matters

Quake Live servers are sensitive to scheduling jitter. When the operating system moves a server process between cores, the process loses its warm CPU cache and can stall briefly while it waits for a core. On a host that runs several instances, those moves also let busy servers compete with each other for the same core.

Pinning each instance to a fixed core keeps its frame timing steadier and spreads the instances across the host's cores.

## How QLSM Assigns It

When an instance is deployed or reconfigured, QLSM:

1. Works out how many CPU cores the host has. Vultr hosts use the plan's vCPU count. Other hosts are detected over Ansible the first time they are needed.
2. Picks the core with the fewest instances already pinned to it. Ties go to the lowest core number.
3. Saves the choice on the instance and writes it into the instance's systemd unit as `CPUAffinity=<core>`.

An instance keeps its core across restarts and reconfigures. QLSM only picks a new one if the saved core no longer exists on the host, for example after a resize to a plan with fewer cores.

## What The Field Shows

| Value | Meaning |
| --- | --- |
| `CPU 0`, `CPU 1`, … | The instance is pinned to that core (counted from 0). |
| `Automatic` | No core is pinned. The operating system schedules the server on any core. |

`Automatic` appears for single-core hosts, where pinning has no benefit, and when QLSM could not determine the host's core count.

## Changing It

The core is assigned automatically and cannot be edited in QLSM.

## Related Pages

- [Deploy A New Instance](../getting-started/deploy-new-instance.md)
- [Add A Host (Cloud Or Standalone)](../getting-started/add-host.md)
- [99k LAN Rate](99k-lan-rate.md)
