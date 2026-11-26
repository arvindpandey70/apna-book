import React, { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../../../context/AppContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import {
  buildAllGroups,
  collectGroupDescendantLedgers,
  findAccountRootIds,
  getChildAccountGroups,
  getDirectGroupLedgers,
  isUnderPurchaseAccounts,
  type AccountRootOpts,
  type PlGroup,
} from "../../../utils/plGroupHelpers";

type PurchaseLedger = {
  id: number;
  name: string;
  opening_balance: number;
  closing_balance: number;
  balance_type: string;
  group_id: number;
};

type TreeRow = {
  key: string;
  kind: "group" | "ledger";
  id: number;
  name: string;
  debit: number | "";
  credit: number | "";
  closing: number;
  closingType: "Dr" | "Cr";
};

const PURCHASE_ROOT_OPTS: AccountRootOpts = {
  systemId: -15,
  rootNameNormalized: "purchaseaccounts",
};

const PurchaseDetail: React.FC = () => {
  const { theme, ledgerGroups } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const scopedGroupId = searchParams.get("groupId")
    ? Number(searchParams.get("groupId"))
    : null;
  const scopedGroupName = searchParams.get("groupName") || "";

  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  const [purchaseLedgers, setPurchaseLedgers] = useState<PurchaseLedger[]>([]);
  const [allGroups, setAllGroups] = useState<PlGroup[]>([]);
  const [purchaseIds, setPurchaseIds] = useState<number[]>([]);
  const [purchaseTotals, setPurchaseTotals] = useState<Record<number, string>>(
    {}
  );
  const [ledgerBalances, setLedgerBalances] = useState<
    Record<number, { debit: number; credit: number }>
  >({});

  useEffect(() => {
    const fetchPurchaseLedgers = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/group-summary?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        const data = await res.json();
        const ledgers = data.ledgers || [];
        const groups = buildAllGroups(
          data.ledgerGroups || [],
          ledgerGroups || []
        );

        const purchases = ledgers
          .filter((l: any) => isUnderPurchaseAccounts(groups, l.group_id))
          .map((l: any) => ({
            id: Number(l.id),
            name: l.name,
            opening_balance: Number(l.opening_balance) || 0,
            closing_balance: Number(l.closing_balance) || 0,
            balance_type: l.balance_type,
            group_id: Number(l.group_id),
          }));

        setAllGroups(groups);
        setPurchaseLedgers(purchases);
        setPurchaseIds(purchases.map((p: PurchaseLedger) => Number(p.id)));
      } catch (error) {
        console.error("Group Summary Error:", error);
        setAllGroups([]);
        setPurchaseLedgers([]);
        setPurchaseIds([]);
      }
    };

    fetchPurchaseLedgers();
  }, [companyId, ownerId, ownerType, ledgerGroups]);

  useEffect(() => {
    const fetchPurchaseData = async () => {
      try {
        if (purchaseIds.length === 0) return;

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/purchase?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ids=${purchaseIds.join(",")}`
        );

        const data = await res.json();

        if (data.success) {
          setPurchaseTotals(data.data);
        }
      } catch (error) {
        console.error("Purchase API Error:", error);
      }
    };

    fetchPurchaseData();
  }, [companyId, ownerId, ownerType, purchaseIds]);

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        if (purchaseIds.length === 0) return;

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${purchaseIds.join(",")}`
        );
        const data = await res.json();
        if (data.success) {
          setLedgerBalances(data.data || {});
        }
      } catch (error) {
        console.error("Ledger balances fetch error:", error);
      }
    };

    fetchBalances();
  }, [companyId, ownerId, ownerType, purchaseIds]);

  const getLedgerAmounts = (ledger: PurchaseLedger) => {
    const apiAmount = purchaseTotals[ledger.id as number];
    const amount = apiAmount ? Number(apiAmount) : 0;

    const debitVal =
      amount >= 0
        ? ledger.balance_type === "debit"
          ? amount
          : 0
        : ledger.balance_type === "credit"
          ? Math.abs(amount)
          : 0;
    const creditVal =
      amount >= 0
        ? ledger.balance_type === "credit"
          ? amount
          : 0
        : ledger.balance_type === "debit"
          ? Math.abs(amount)
          : 0;

    const bal = ledgerBalances[ledger.id];
    let closingNet = 0;
    if (bal) {
      closingNet = (bal.debit || 0) - (bal.credit || 0);
    } else if (ledger.closing_balance) {
      closingNet =
        String(ledger.balance_type).toLowerCase() === "credit"
          ? -Math.abs(Number(ledger.closing_balance))
          : Math.abs(Number(ledger.closing_balance));
    } else {
      closingNet = amount;
    }

    return {
      debit: debitVal,
      credit: creditVal,
      closing: Math.abs(closingNet),
      closingType: (closingNet >= 0 ? "Dr" : "Cr") as "Dr" | "Cr",
      closingNet,
    };
  };

  const purchaseRootIds = useMemo(
    () => findAccountRootIds(allGroups, PURCHASE_ROOT_OPTS),
    [allGroups]
  );

  const sumLedgers = (ledgers: PurchaseLedger[]) => {
    let debit = 0;
    let credit = 0;
    let closingNet = 0;

    ledgers.forEach((l) => {
      const amt = getLedgerAmounts(l);
      debit += Number(amt.debit) || 0;
      credit += Number(amt.credit) || 0;
      closingNet += amt.closingNet;
    });

    return {
      debit,
      credit,
      closing: Math.abs(closingNet),
      closingType: (closingNet >= 0 ? "Dr" : "Cr") as "Dr" | "Cr",
    };
  };

  const activeRootIds = useMemo(() => {
    if (scopedGroupId !== null && !Number.isNaN(scopedGroupId)) {
      return [scopedGroupId];
    }
    return purchaseRootIds;
  }, [scopedGroupId, purchaseRootIds]);

  const pageTitle = useMemo(() => {
    if (scopedGroupName) return scopedGroupName;
    if (scopedGroupId !== null && !Number.isNaN(scopedGroupId)) {
      const g = allGroups.find((x) => Number(x.id) === Number(scopedGroupId));
      if (g?.name) return g.name;
    }
    return "Purchase Account";
  }, [scopedGroupName, scopedGroupId, allGroups]);

  const treeRows = useMemo(() => {
    if (allGroups.length === 0 && purchaseLedgers.length === 0) return [];

    const rows: TreeRow[] = [];
    const seenKeys = new Set<string>();

    // Show only direct subgroups + direct ledgers of the active group;
    // clicking a subgroup opens its own scoped view.
    activeRootIds.forEach((rootId) => {
      const childGroups = getChildAccountGroups(
        allGroups,
        rootId,
        PURCHASE_ROOT_OPTS
      );
      const directLedgers = getDirectGroupLedgers(
        allGroups,
        purchaseLedgers,
        rootId
      );

      childGroups.forEach((group) => {
        const key = `group-${group.id}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        const descendants = collectGroupDescendantLedgers(
          allGroups,
          purchaseLedgers,
          Number(group.id),
          PURCHASE_ROOT_OPTS
        );
        const totals = sumLedgers(descendants);

        rows.push({
          key,
          kind: "group",
          id: Number(group.id),
          name: group.name || `Group ${group.id}`,
          debit: totals.debit || "",
          credit: totals.credit || "",
          closing: totals.closing,
          closingType: totals.closingType,
        });
      });

      directLedgers.forEach((ledger) => {
        const key = `ledger-${ledger.id}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        const amt = getLedgerAmounts(ledger);
        rows.push({
          key,
          kind: "ledger",
          id: ledger.id,
          name: ledger.name,
          debit: amt.debit || "",
          credit: amt.credit || "",
          closing: amt.closing,
          closingType: amt.closingType,
        });
      });
    });

    // Only show truly unplaced purchase ledgers (not direct and not under any displayed subgroup)
    if (scopedGroupId === null) {
      const coveredLedgerIds = new Set<number>();
      rows.forEach((r) => {
        if (r.kind === "ledger") {
          coveredLedgerIds.add(r.id);
        } else {
          collectGroupDescendantLedgers(
            allGroups,
            purchaseLedgers,
            r.id,
            PURCHASE_ROOT_OPTS
          ).forEach((l) => coveredLedgerIds.add(l.id));
        }
      });

      purchaseLedgers
        .filter((l) => !coveredLedgerIds.has(l.id))
        .forEach((ledger) => {
          const amt = getLedgerAmounts(ledger);
          rows.push({
            key: `ledger-orphan-${ledger.id}`,
            kind: "ledger",
            id: ledger.id,
            name: ledger.name,
            debit: amt.debit || "",
            credit: amt.credit || "",
            closing: amt.closing,
            closingType: amt.closingType,
          });
        });
    }

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allGroups,
    purchaseLedgers,
    purchaseTotals,
    ledgerBalances,
    activeRootIds,
    scopedGroupId,
  ]);

  const handleRowClick = (row: TreeRow) => {
    if (row.kind === "ledger") {
      navigate(
        `/app/reports/profit-loss/purchase/alldetails?ledger=${encodeURIComponent(
          row.name
        )}&groupId=${row.id}`
      );
      return;
    }

    navigate(
      `/app/reports/profit-loss/purchase?groupId=${row.id}&groupName=${encodeURIComponent(
        row.name
      )}`
    );
  };

  const formatAmount = (val: number | string) => {
    if (val === "" || val === null || val === undefined) return "";
    const n = Number(val);
    if (!n) return "";
    return n.toLocaleString();
  };

  return (
    <div className="pt-[56px] px-4">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className={`mr-4 p-2 rounded-full ${
            theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
          }`}
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="text-2xl font-bold">{pageTitle}</h1>

        <div className="ml-auto flex gap-2">
          <button className="p-2 rounded-md hover:bg-gray-200">
            <Printer size={18} />
          </button>
          <button className="p-2 rounded-md hover:bg-gray-200">
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="w-full border border-gray-300 rounded-md overflow-hidden">
        <div className="bg-gray-100 border-b border-gray-300">
          <div className="py-3 text-center">
            <div className="text-lg font-semibold">{pageTitle}</div>
            <div className="text-xs text-gray-500">
              For the year ended {new Date().getFullYear()}
            </div>
          </div>

          <div className="grid grid-cols-4 text-sm font-semibold border-t border-gray-300">
            <div className="px-3 py-2 text-left border-r border-gray-300">
              Particulars
            </div>
            <div className="px-3 py-2 text-center border-r border-gray-300">
              Debit
            </div>
            <div className="px-3 py-2 text-center border-r border-gray-300">
              Credit
            </div>
            <div className="px-3 py-2 text-center">Closing</div>
          </div>
        </div>

        {treeRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            No purchase groups or ledgers found
          </div>
        ) : (
          treeRows.map((row) => (
            <div
              key={row.key}
              onClick={() => handleRowClick(row)}
              className={`grid grid-cols-4 text-sm border-b border-gray-200 cursor-pointer ${
                theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-50"
              } ${row.kind === "group" ? "bg-gray-50 font-semibold" : ""}`}
            >
              <div
                className={`px-3 py-2 border-r border-gray-300 ${
                  row.kind === "group"
                    ? "text-indigo-700 italic"
                    : "text-blue-600"
                }`}
              >
                {row.name}
              </div>

              <div className="px-3 py-2 text-center font-mono border-r border-gray-300">
                {formatAmount(row.debit)}
              </div>

              <div className="px-3 py-2 text-center font-mono border-r border-gray-300">
                {formatAmount(row.credit)}
              </div>

              <div className="px-3 py-2 text-center font-mono">
                {row.closing
                  ? `${row.closing.toLocaleString()} ${row.closingType}`
                  : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PurchaseDetail;
