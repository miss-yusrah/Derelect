//! DERELICT station factory.
//!
//! Creates station accounts as subaccounts of itself, without any access
//! keys — the deployed station contract is the only controller of each
//! station account. The factory is a discovery index only and retains no
//! station spending authority.
//!
//! The station wasm is provided once at initialization and stored on-chain.
//! `create_station` batches: create_account, transfer (storage + operating
//! funding), deploy_contract, function_call("new", ...) — one receipt chain.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::LazyOption;
use near_sdk::store::{UnorderedMap, Vector};
use near_sdk::{AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, env, near, serde_json, require};

/// 1 credit = 0.001 NEAR.
pub const CREDIT: u128 = 1_000_000_000_000_000_000_000;
/// Opening operating funds for a new station: 10 credits.
pub const OPENING_OPERATING: u128 = 10 * CREDIT;
/// Storage + execution reserve funding for a new station account.
/// The station wasm is several hundred KB; byte cost is 10^19 yocto/byte.
pub const STATION_STORAGE_RESERVE: u128 = 6_000_000_000_000_000_000_000_000u128; // 6 NEAR
pub const STATION_FUNDING: u128 = STATION_STORAGE_RESERVE + OPENING_OPERATING;
/// Gas for the station init call inside the batch.
pub const GAS_STATION_INIT: Gas = Gas::from_tgas(30);

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Wasm,
    Stations,
    StationInfo,
}

/// Index entry shown by the station browser.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, serde::Serialize, serde::Deserialize)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct StationInfo {
    pub station_account: AccountId,
    pub captain: AccountId,
    pub scenario: String,
    pub created_block: u64,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Factory {
    /// Fixed station contract code deployed to every created station.
    wasm: LazyOption<Vec<u8>>,
    stations: Vector<AccountId>,
    /// Index entry shown by the station browser.
    info: UnorderedMap<String, StationInfo>,
}

#[near]
impl Factory {
    /// Attach the station wasm code at deploy time.
    #[init]
    pub fn new(wasm_code: Vec<u8>) -> Self {
        require!(!env::state_exists(), "Factory already initialized");
        require!(!wasm_code.is_empty(), "station wasm code required");
        Self {
            wasm: LazyOption::new(StorageKey::Wasm, Some(wasm_code)),
            stations: Vector::new(StorageKey::Stations),
            info: UnorderedMap::new(StorageKey::StationInfo),
        }
    }

    /// Create and fund a new station subaccount with no access keys.
    /// The attached deposit covers storage, execution reserve and the
    /// station's opening operating funds (10 credits).
    #[payable]
    pub fn create_station(&mut self, name: String, captain: AccountId, scenario: String) {
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit >= STATION_FUNDING,
            "Attach at least {STATION_FUNDING} yoctoNEAR for storage and opening funds"
        );
        require!(
            !name.is_empty()
                && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_'),
            "Station name must be lowercase alphanumerics, dash or underscore"
        );
        let factory = env::current_account_id();
        let station_account: AccountId = format!("{name}.{factory}")
            .parse()
            .expect("station account id");
        require!(
            self.filter_registered(&station_account).is_none(),
            "Station name already used"
        );
        let wasm = self.wasm.get().as_deref().expect("wasm initialized");

        let init_args = serde_json::json!({
            "owner_id": captain,
            "campaign_id": 1,
            "metadata": {
                "spec": "nft-1.0.0",
                "name": name,
                "symbol": "DRLCT",
                "icon": None::<String>,
                "base_uri": None::<String>,
                "reference": None::<String>,
                "reference_hash": None::<String>,
            },
        })
        .to_string()
        .into_bytes();

        // Batch on this factory account so it can create its own subaccount.
        // The batch receiver is the new subaccount; this factory (the batch
        // creator) is its parent, which authorizes account creation without
        // any keys on the child.
        let batch = env::promise_batch_create(&station_account);
        // The batch account (this factory) is the parent of the new subaccount.
        env::promise_batch_action_create_account(batch);
        env::promise_batch_action_transfer(batch, NearToken::from_yoctonear(STATION_FUNDING));
        env::promise_batch_action_deploy_contract(batch, &wasm);
        env::promise_batch_action_function_call(
            batch,
            "new",
            &init_args,
            NearToken::from_yoctonear(OPENING_OPERATING),
            GAS_STATION_INIT,
        );

        self.stations.push(station_account.clone());
        self.info.insert(
            name.clone(),
            StationInfo {
                station_account,
                captain,
                scenario,
                created_block: env::block_height(),
            },
        );
        assert!(self.info.get(&name).is_some(), "info entry must be readable right after insert");
    }

    fn filter_registered(&self, account: &AccountId) -> Option<AccountId> {
        let s = account.to_string();
        if self
            .stations
            .iter()
            .any(|a| a.to_string() == s)
        {
            Some(account.clone())
        } else {
            None
        }
    }

    /// Discovery index over created stations.
    pub fn get_stations(&self) -> Vec<StationInfo> {
        self.stations
            .iter()
            .map(|acc| {
                let name = acc
                    .to_string()
                    .split_once('.')
                    .map(|(n, _)| n.to_string())
                    .unwrap_or_default();
                println!("DBG factory: station {acc} -> name {name:?}; info contains: {}", self.info.get(&name).is_some());
                self.info.get(&name).cloned()
            })
            .collect::<Vec<Option<StationInfo>>>()
            .into_iter()
            .flatten()
            .collect()
    }

    pub fn get_wasm_hash(&self) -> String {
        let wasm_bytes = self.wasm.get().as_deref().expect("wasm initialized");
        hex(&env::sha256(&wasm_bytes))
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_wasm() -> Vec<u8> {
        vec![0u8; 16]
    }

    #[test]
    fn create_station_pushes_index() {
        let mut b = near_sdk::test_utils::VMContextBuilder::new();
        b.current_account_id("factory.testnet".parse().unwrap())
            .predecessor_account_id("player.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(STATION_FUNDING));
        near_sdk::testing_env!(b.build());

        let mut f = Factory::new(fake_wasm());
        let captain: AccountId = "captain.testnet".parse().unwrap();
        f.create_station("isa01".to_string(), captain.clone(), "standard".to_string());
        println!("stations = {:?}", f.stations.iter().collect::<Vec<_>>());
        assert_eq!(f.stations.len(), 1);
        let listed = f.get_stations();
        println!("listed = {:?}", listed);
        assert_eq!(listed.len(), 1);
        let expected: AccountId = "isa01.factory.testnet".parse().unwrap();
        assert_eq!(listed[0].station_account, expected);
    }
}
