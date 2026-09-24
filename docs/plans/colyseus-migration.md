# Colyseus migration — completed local phase

- [x] Inventory existing flight, combat, bots, travel, identity, chat and voice behaviour.
- [x] Implement a local authoritative room, shared protocol, persistent guest sessions and message validation.
- [x] Keep one universe with active systems and interest management; never split a filled system into hidden copies.
- [x] Implement server flight/combat and responsive client prediction/reconciliation.
- [x] Integrate travel, reconnect, departure, sonar and voice signalling without redesigning the economy.
- [x] Verify illegal input, identity/position/damage forgery, cooldown, travel, capacity, reconnect and visibility.
- [x] Verify two real browser clients in HIGH/LOW and local active loads of 10, 25, 50 and 100.
- [x] Prepare isolated service/proxy templates and rollback documentation.

The local phase passed 84 unit tests, four network browser scenarios, ten offline scenarios, eight load scenarios and a bot battle. Its 100-client result applied to the development machine. Production access was separately authorized later; VPS profiling selected 50. See [local report](../phases_archive/colyseus-local-2026-09-19/README.md) and [deployment](colyseus-deployment.md).
