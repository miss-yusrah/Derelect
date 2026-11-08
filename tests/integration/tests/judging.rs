//! DERELICT sandbox integration tests.
//!
//! Release blockers from the plan: real receipts, receiver-roll-back
//! semantics with epoch bumps, old-captain rejection after sale, exactly-once
//! payout claims, and visitor refund payouts end to end.

use near_workspaces::types::NearToken;
use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::{json, Value};
use std::str::FromStr;

pub const STATION_WASM: &[u8] = include_bytes!("../../../target/wasm/derelict_station.wasm");
pub const FACTORY_WASM: &[u8] = include_bytes!("../../../target/wasm/derelict_factory.wasm");

/// 1 credit = 0.001 NEAR.
pub const CREDIT: u128 = 1_000_000_000_000_000_000_000;

/// Deploy station wasm to a fresh account and initialize the standard salvage
/// scenario owned by `captain`.
async fn deploy_station(worker: &Worker<Sandbox>, captain: &Account) -> anyhow::Result<Contract> {
    // dev_deploy creates an account with code; the init call itself carries
    // the opening operating funds (10 credits).
    let station = worker.dev_deploy(STATION_WASM).await?;
    let dev = station.as_account();
    dev.call(station.id(), "new")
        .args_json(json!({
            "owner_id": captain.id(),
            "campaign_id": 1,
            "metadata": {
                "spec": "nft-1.0.0",
                "name": "station",
                "symbol": "DRLCT",
                "icon": null,
                "base_uri": null,
                "reference": null,
                "reference_hash": null,
            },
        }))
        .deposit(NearToken::from_yoctonear(10 * CREDIT))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(station)
}

async fn state(contract: &Contract) -> anyhow::Result<Value> {
    Ok(contract.view("get_state").args_json(json!({})).await?.json()?)
}

async fn revision(contract: &Contract) -> anyhow::Result<u64> {
    Ok(state(contract).await?["revision"].as_u64().unwrap())
}

/// Captain plays one action bound to the fresh revision.
async fn act(account: &Account, contract: &Contract, action: Value) -> anyhow::Result<()> {
    account
        .call(contract.id(), "act")
        .args_json(json!({
            "action": action,
            "expected_revision": revision(contract).await?,
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn fund_offers(visitor: &Account, contract: &Contract) -> anyhow::Result<()> {
    for _ in 0..6 {
        for (kind, amount) in [("standard", 5 * CREDIT), ("heavy", 8 * CREDIT)] {
            visitor
                .call(contract.id(), "fund_offer")
                .args_json(json!({ "kind": kind }))
                .deposit(NearToken::from_yoctonear(amount))
                .max_gas()
                .transact()
                .await?
                .into_result()?;
        }
    }
    Ok(())
}

/// Claim the repair fee; advance blocks until the threshold is passed.
async fn claim_repair_when_eligible(
    worker: &Worker<Sandbox>,
    supplier: &Account,
    contract: &Contract,
) -> anyhow::Result<()> {
    for _ in 0..12 {
        let result = supplier
            .call(contract.id(), "claim_repair")
            .max_gas()
            .transact()
            .await?;
        let ok = result.is_success();
        if ok {
            return Ok(());
        }
        worker.fast_forward(3).await?;
    }
    anyhow::bail!("repair claim never became eligible")
}

/// The complete judging scenario: repair route with the sale between turns
/// 3 and 4. This is the primary hook demo.
#[tokio::test]
async fn full_judging_repair_route_with_midrepair_sale() -> anyhow::Result<()> {    let worker = near_workspaces::sandbox().await?;
    let captain = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;
    let visitor = worker.dev_create_account().await?;
    let supplier = worker.dev_create_account().await?;
    let station = deploy_station(&worker, &captain).await?;
    fund_offers(&visitor, &station).await?;

    // T1 standard: 10 -> 13
    act(&captain, &station, json!({"kind": "standardDocking"})).await?;
    let st = state(&station).await?;
    assert_eq!(st["operating"].as_str(), Some((13u128 * CREDIT).to_string()).as_deref());
    assert_eq!(st["fuel"].as_u64(), Some(3));

    // T2 heavy: 21, hull 2 -> 1
    act(&captain, &station, json!({"kind": "heavyDocking"})).await?;
    let st = state(&station).await?;
    assert_eq!(st["operating"].as_str(), Some((21u128 * CREDIT).to_string()).as_deref());
    assert_eq!(st["hull"].as_u64(), Some(1));

    // Unused standard-offer escrow refunds to the payer: 2 credits.
    let buckets = station.view("get_buckets").args_json(json!({})).await?.json::<Value>()?;
    assert_eq!(
        buckets["visitor_refund_balance"].as_str(),
        Some((2u128 * CREDIT).to_string()).as_deref(),
        "unused escrow share stays the visitor's"
    );

    // T3 commission repair: 21 -> 17, protected reserve 4.
    captain
        .call(station.id(), "act")
        .args_json(json!({
            "action": {"kind": "commissionRepair", "supplier": supplier.id()},
            "expected_revision": revision(&station).await?,
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let st = state(&station).await?;
    assert_eq!(st["operating"].as_str(), Some((17u128 * CREDIT).to_string()).as_deref());
    assert_eq!(st["repair"]["supplier"], supplier.id().as_str());

    // Sale between turns 3 and 4.
    let epoch = st["epoch"].as_u64().unwrap();
    captain
        .call(station.id(), "list_for_sale")
        .args_json(json!({"price": (15 * CREDIT).to_string()}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let rev = revision(&station).await?;
    buyer
        .call(station.id(), "purchase")
        .args_json(json!({"expected_revision": rev}))
        .deposit(NearToken::from_yoctonear(15 * CREDIT))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let st = state(&station).await?;
    assert_eq!(st["owner"], buyer.id().as_str(), "sale moved ownership");
    assert_eq!(st["epoch"].as_u64().unwrap(), epoch + 1);
    assert_eq!(st["turn"].as_u64(), Some(4), "sale consumed no turn");
    assert_eq!(st["operating"].as_str(), Some((17u128 * CREDIT).to_string()).as_deref());
    assert_eq!(st["repair"]["supplier"], supplier.id().as_str(), "repair survives sale");

    // Seller receivable recorded; payable to the former captain.
    let buckets = station.view("get_buckets").args_json(json!({})).await?.json::<Value>()?;
    assert_eq!(
        buckets["seller_receivable"].as_str(),
        Some((15u128 * CREDIT).to_string()).as_deref()
    );

    // Old captain's identical instruction must now reject.
    let old = captain
        .call(station.id(), "act")
        .args_json(json!({
            "action": {"kind": "wait"},
            "expected_revision": revision(&station).await?,
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(!old.is_success(), "former captain must be rejected");

    // T4 refuel 3 as new captain: repair effect lands hull 1 -> 3.
    act(&buyer, &station, json!({"kind": "refuel", "units": 3})).await?;
    let st = state(&station).await?;
    assert_eq!(st["operating"].as_str(), Some((11u128 * CREDIT).to_string()).as_deref());
    assert_eq!(st["hull"].as_u64(), Some(3), "due repair effect after turn-4 action");
    assert_eq!(st["turn"].as_u64(), Some(5));

    // Supplier settlement — independent of the new captain.
    claim_repair_when_eligible(&worker, &supplier, &station).await?;
    let st = state(&station).await?;
    assert_eq!(st["repair"]["paid"], true, "original supplier got its fee");
    let buckets = station.view("get_buckets").args_json(json!({})).await?.json::<Value>()?;
    assert_eq!(
        buckets["reserved_repair"].as_str(),
        Some("0"),
        "reserve released on successful payout"
    );

    // T5, T6 heavy dockings: 19 then 27 credits; campaign won.
    act(&buyer, &station, json!({"kind": "heavyDocking"})).await?;
    act(&buyer, &station, json!({"kind": "heavyDocking"})).await?;
    let st = state(&station).await?;
    assert_eq!(st["operating"].as_str(), Some((27u128 * CREDIT).to_string()).as_deref());
    assert_eq!(st["outcome"]["success"], true);
    assert_eq!(
        st["outcome"]["score"].as_str(),
        Some((27u128 * CREDIT).to_string()).as_deref()
    );

    Ok(())
}

/// Receiver rejection: ownership rolls back, epoch advances twice, and the
/// station unlocks. Receiver here is a contract without nft_on_transfer.
#[tokio::test]
async fn receiver_reject_rolls_back_and_unlocks() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let captain = worker.dev_create_account().await?;
    let station = deploy_station(&worker, &captain).await?;

    // A contract WITHOUT nft_on_transfer (factory wasm deployed but not init'd).
    let factory = worker.dev_deploy(FACTORY_WASM).await?;

    let st = state(&station).await?;
    let epoch = st["epoch"].as_u64().unwrap();

    captain
        .call(station.id(), "nft_transfer_call")
        .args_json(json!({
            "receiver_id": factory.id(),
            "token_id": "station",
            "approval_id": null,
            "memo": null,
            "msg": "take it",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Wait for the chain of receipts to settle (few blocks), then verify.
    for _ in 0..6 {
        let st = state(&station).await?;
        if st["locked"].as_bool() == Some(false)
            && st["owner"].as_str() != Some(factory.id().as_str())
        {
            break;
        }
        worker.fast_forward(2).await?;
    }
    let st = state(&station).await?;
    assert_eq!(
        st["owner"].as_str(),
        Some(captain.id().as_str()),
        "ownership rolls back to the previous owner"
    );
    assert_eq!(
        st["epoch"].as_u64().unwrap(),
        epoch + 2,
        "provisional ownership and rollback each advance the epoch"
    );
    assert_eq!(st["locked"], false, "station unlocked after resolution");

    // Captain authority restored after rollback.
    act(&captain, &station, json!({"kind": "wait"})).await?;
    Ok(())
}

/// Exactly-once payout: a second supplier claim after payment must reject.
#[tokio::test]
async fn duplicate_supplier_claim_after_payment_rejects() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let captain = worker.dev_create_account().await?;
    let visitor = worker.dev_create_account().await?;
    let supplier = worker.dev_create_account().await?;
    let station = deploy_station(&worker, &captain).await?;
    fund_offers(&visitor, &station).await?;

    // Commission repair on turn 1, then complete the turn so the effect lands.
    captain
        .call(station.id(), "act")
        .args_json(json!({
            "action": {"kind": "commissionRepair", "supplier": supplier.id()},
            "expected_revision": revision(&station).await?,
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    act(&captain, &station, json!({"kind": "wait"})).await?;

    claim_repair_when_eligible(&worker, &supplier, &station).await?;
    let st = state(&station).await?;
    assert_eq!(st["repair"]["paid"], true);

    // Second claim must fail: the fee was already paid.
    let again = supplier
        .call(station.id(), "claim_repair")
        .max_gas()
        .transact()
        .await?;
    assert!(
        !again.is_success(),
        "duplicate repair claim must be rejected"
    );
    Ok(())
}

/// No access keys on stations created by the real factory path.
#[tokio::test]
async fn factory_creates_keyless_station_accounts() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let captain = worker.dev_create_account().await?;

    // Factory account: deploy + init with the station wasm embedded.
    let factory = worker.dev_deploy(FACTORY_WASM).await?;
    factory
        .as_account()
        .call(factory.id(), "new")
        .args_json(json!({"wasm_code": STATION_WASM}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Create the station through the factory (production path).
    let create = factory
        .as_account()
        .call(factory.id(), "create_station")
        .args_json(json!({"name": "isa01", "captain": captain.id(), "scenario": "standard-salvage"}))
        .deposit(NearToken::from_yoctonear(6_021 * 10u128.pow(21)))
        .max_gas()
        .transact()
        .await?;
    for f in create.failures() {
        eprintln!("create_station receipt failure: {:?}", f);
    }
    create.into_result()?;

    let station_captain_state = factory
        .view("get_stations")
        .args_json(json!({}))
        .await?
        .json::<Value>()?;
    assert!(
        station_captain_state.is_array() && !station_captain_state.as_array().unwrap().is_empty(),
        "factory index should list the new station, got {:?}",
        station_captain_state
    );
    let station_id = station_captain_state[0]["station_account"]
        .as_str()
        .unwrap()
        .to_string();
    let station_account = near_workspaces::AccountId::from_str(&station_id)?;

    let keys = worker.view_access_keys(&station_account).await?;
    assert!(
        keys.is_empty(),
        "factory-created stations must have zero access keys, got {}",
        keys.len()
    );

    // The station initialized correctly and the captain can act.
    let st = worker
        .view(&station_account, "get_state")
        .args_json(json!({}))
        .await?
        .json::<Value>()?;
    assert_eq!(st["owner"], captain.id().as_str());
    assert_eq!(st["operating"].as_str(), Some((10u128 * CREDIT).to_string()).as_deref());

    Ok(())
}
