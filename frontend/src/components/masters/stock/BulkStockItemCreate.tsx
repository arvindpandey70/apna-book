import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Download, Upload, FileText, Save, X, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../../context/AppContext';
import type { StockItem } from '../../../types';
import Barcode from 'react-barcode';
import Swal from 'sweetalert2';

interface BulkStockItemRow extends Omit<StockItem, 'id'> {
  stockGroupId: string;
  gstLedgerId: string;
  cgstLedgerId: string;
  sgstLedgerId: string;
  barcode: string;
  tempId: string;
  isValid: boolean;
  errors: { [key: string]: string };
}

const generateEAN13 = () => {
  let code = "890"; // India prefix
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  return code + checksum;
};

const BulkStockItemCreate: React.FC = () => {
  const { theme, stockGroups = [] } = useAppContext();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<{ value: string, label: string }[]>([]);
  const [units, setUnits] = useState<{ value: string, label: string }[]>([]);
  const [gstLedgers, setGstLedgers] = useState<{
    gst: any[];
    cgst: any[];
    sgst: any[];
    igst: any[];
  }>({
    gst: [],
    cgst: [],
    sgst: [],
    igst: [],
  });

  React.useEffect(() => {
    const companyId = localStorage.getItem('company_id');
    const ownerType = localStorage.getItem('userType');
    const ownerId = localStorage.getItem(ownerType === 'employee' ? 'employee_id' : 'user_id');
    if (!companyId || !ownerType || !ownerId) return;

    const params = new URLSearchParams({
      company_id: companyId,
      owner_type: ownerType,
      owner_id: ownerId,
    });

    fetch(`${import.meta.env.VITE_API_URL}/api/stock-categories?${params.toString()}`)
      .then(res => res.json())
      .then(categoriesData => {
        setCategories(Array.isArray(categoriesData) && categoriesData.length
          ? categoriesData.map((cat: any) => ({ value: cat.id.toString(), label: cat.name }))
          : []
        );
      })
      .catch(console.error);

    fetch(`${import.meta.env.VITE_API_URL}/api/stock-units?${params.toString()}`)
      .then(res => res.json())
      .then(unitsData => {
        setUnits(Array.isArray(unitsData) && unitsData.length
          ? unitsData.map((u: any) => ({ value: u.id.toString(), label: u.symbol }))
          : []
        );
      })
      .catch(console.error);

    fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setGstLedgers(data.data);
        }
      })
      .catch(console.error);
  }, []);

  const [bulkItems, setBulkItems] = useState<BulkStockItemRow[]>([
    {
      tempId: '1',
      name: '',
      unit: '',
      stockGroupId: '',
      gstLedgerId: '',
      cgstLedgerId: '',
      sgstLedgerId: '',
      hsnCode: '',
      barcode: generateEAN13(),
      openingBalance: 0,
      openingValue: 0,
      gstRate: 0,
      taxType: 'Taxable',
      standardPurchaseRate: 0,
      standardSaleRate: 0,
      enableBatchTracking: false,
      allowNegativeStock: false,
      maintainInPieces: true,
      secondaryUnit: '',
      isValid: false,
      errors: {}
    }
  ]);

  const [showPreview, setShowPreview] = useState(false);

  // Sample CSV template data (Matching by percentage names as requested)
  const csvTemplate = [
    ['Name', 'Category', 'Unit', 'HSN Code', 'IGST Ledger', 'CGST Ledger', 'SGST Ledger'],
    ['Laptop Dell Inspiron', 'Laptops', 'Piece', '8471', '18%', '9%', '9%'],
    ['Wireless Mouse', 'Accessories', 'Piece', '8471', '12%', '6%', '6%'],
    ['Office Desk', 'Furniture', 'Piece', '9401', '18%', '9%', '9%']
  ];

  const addNewRow = () => {
    const newRow: BulkStockItemRow = {
      tempId: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name: '',
      unit: '',
      stockGroupId: '',
      gstLedgerId: '',
      cgstLedgerId: '',
      sgstLedgerId: '',
      hsnCode: '',
      barcode: generateEAN13(),
      openingBalance: 0,
      openingValue: 0,
      gstRate: 0,
      taxType: 'Taxable',
      standardPurchaseRate: 0,
      standardSaleRate: 0,
      enableBatchTracking: false,
      allowNegativeStock: false,
      maintainInPieces: true,
      secondaryUnit: '',
      isValid: false,
      errors: {}
    };
    setBulkItems(prev => [...prev, newRow]);
  };

  const removeRow = (tempId: string) => {
    if (bulkItems.length <= 1) return;
    setBulkItems(prev => prev.filter(item => item.tempId !== tempId));
  };

  const updateRow = (tempId: string, field: keyof Omit<BulkStockItemRow, 'tempId' | 'isValid' | 'errors'>, value: any) => {
    setBulkItems(prev => prev.map(item => {
      if (item.tempId === tempId) {
        const updatedItem = { ...item, [field]: value };
        const { isValid, errors } = validateRow(updatedItem);
        return { ...updatedItem, isValid, errors };
      }
      return item;
    }));
  };

  const validateRow = (item: BulkStockItemRow): { isValid: boolean; errors: { [key: string]: string } } => {
    const errors: { [key: string]: string } = {};
    if (!item.name?.trim()) errors.name = 'Name is required';
    if (!item.unit?.trim()) errors.unit = 'Unit is required';
    if (!item.stockGroupId?.trim()) errors.stockGroupId = 'Category is required';
    if (!item.gstLedgerId?.trim()) errors.gstLedgerId = 'IGST Ledger is required';
    if (!item.cgstLedgerId?.trim()) errors.cgstLedgerId = 'CGST Ledger is required';
    if (!item.sgstLedgerId?.trim()) errors.sgstLedgerId = 'SGST Ledger is required';
    
    return { isValid: Object.keys(errors).length === 0, errors };
  };

  const handleSaveAll = async (items: BulkStockItemRow[]) => {
    const validItems = items.filter(item => item.isValid);
    if (validItems.length < items.length || items.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: 'Cannot save. Some items have missing or incorrect ledgers/categories (highlighted in red). Please fix all errors first.',
        confirmButtonColor: '#d33',
      });
      return;
    }

    try {
      const companyId = localStorage.getItem('company_id');
      const ownerType = localStorage.getItem('userType');
      const ownerId = localStorage.getItem(ownerType === 'employee' ? 'employee_id' : 'user_id');

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/bulk?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validItems.map(item => ({ ...item, companyId, ownerType, ownerId }))),
      });

      const data = await response.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Successfully saved ${data.inserted} stock items.`,
          timer: 3000,
          showConfirmButton: false
        });
        navigate('/app/masters/stock-item');
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Oops...',
          text: 'Save failed: ' + data.message,
        });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: 'error',
        title: 'Network Error',
        text: 'Could not connect to the server. Please try again.',
      });
    }
  };

  const downloadTemplate = () => {
    const csvContent = csvTemplate.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock_items_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length <= 1) {
        Swal.fire({ icon: 'error', title: 'File Empty', text: 'CSV file contains no data rows.' });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const dataRows = lines.slice(1);

      const parsedItems: BulkStockItemRow[] = dataRows.map((line, index) => {
        const values = line.split(',').map(v => v.trim());
        const rowData: any = {};
        headers.forEach((h, i) => { rowData[h] = values[i] || ''; });

        // Numeric extract for detailed matching (e.g., "18%" -> "18", "9%" -> "9")
        const igstVal = (rowData['IGST Ledger'] || '').replace(/[^0-9]/g, '');
        const cgstVal = (rowData['CGST Ledger'] || '').replace(/[^0-9]/g, '');
        const sgstVal = (rowData['SGST Ledger'] || '').replace(/[^0-9]/g, '');

        // Matching Logic
        const categoryInput = (rowData['Category'] || '').trim().toLowerCase();
        const matchedCategory = categories.find(c => 
          c.label.trim().toLowerCase() === categoryInput || 
          c.value.toString() === categoryInput
        );

        const matchedUnit = units.find(u => 
          u.label.trim().toLowerCase() === rowData['Unit']?.trim().toLowerCase() || 
          u.value.toString() === rowData['Unit']?.trim().toLowerCase()
        );
        
        const allIgstLedgers = [...gstLedgers.gst, ...gstLedgers.igst];
        
        // Match by looking for the percentage string in the ledger name
        const matchedGst = igstVal ? allIgstLedgers.find(l => l.name.includes(igstVal)) : null;
        const matchedCgst = cgstVal ? gstLedgers.cgst.find(l => l.name.includes(cgstVal)) : null;
        const matchedSgst = sgstVal ? gstLedgers.sgst.find(l => l.name.includes(sgstVal)) : null;

        const newItem: BulkStockItemRow = {
          tempId: (Date.now() + index).toString() + Math.random().toString(36).substr(2, 9),
          name: rowData['Name'] || '',
          stockGroupId: matchedCategory?.value || '',
          unit: matchedUnit?.value || '',
          hsnCode: rowData['HSN Code'] || '',
          gstLedgerId: matchedGst?.id?.toString() || '',
          cgstLedgerId: matchedCgst?.id?.toString() || '',
          sgstLedgerId: matchedSgst?.id?.toString() || '',
          barcode: generateEAN13(), // Auto-generated
          
          openingBalance: 0,
          openingValue: 0,
          gstRate: parseInt(igstVal) || 0,
          taxType: 'Taxable',
          standardPurchaseRate: 0,
          standardSaleRate: 0,
          enableBatchTracking: false,
          allowNegativeStock: false,
          maintainInPieces: true,
          secondaryUnit: '',
          isValid: false,
          errors: {}
        };

        const { isValid, errors } = validateRow(newItem);
        return { ...newItem, isValid, errors };
      });

      setBulkItems(prev => {
        // If we only have the initial empty row, replace it. Otherwise, append.
        if (prev.length === 1 && !prev[0].name.trim() && !prev[0].unit.trim()) {
          return parsedItems;
        }
        return [...prev, ...parsedItems];
      });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validItemsCount = bulkItems.filter(item => item.isValid).length;
  const totalItemsCount = bulkItems.length;

  const deduplicateLedgers = (items: any[]) => {
    const seen = new Set<string>();
    return items.filter((l) => {
      if (!l || l.id === undefined || l.id === null) return false;
      const key = String(l.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  return (
    <div className="pt-[56px] px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/app/masters/stock-item')}
            className={`mr-4 p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
            title="Back to Stock Items"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Bulk Stock Item Creation</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-sm px-4 py-1.5 rounded-full font-bold shadow-sm ${validItemsCount === totalItemsCount && totalItemsCount > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {validItemsCount}/{totalItemsCount} VALIDATED
          </span>

          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 text-white font-medium transition-all shadow-md active:scale-95"
          >
            <FileText size={18} />
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>

          <button
            onClick={() => handleSaveAll(bulkItems)}
            disabled={validItemsCount < totalItemsCount || totalItemsCount === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all shadow-lg active:scale-95 ${validItemsCount === totalItemsCount && totalItemsCount > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-400 cursor-not-allowed text-gray-200'}`}
          >
            <Save size={18} />
            SAVE FINAL ({validItemsCount}/{totalItemsCount})
          </button>
        </div>
      </div>

      <div className={`p-5 mb-6 rounded-xl border-l-4 border-l-blue-500 shadow-sm ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-widest text-gray-400">Manual Controls</h4>
            <button onClick={addNewRow} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition-all w-full justify-center shadow-md active:scale-95">
              <Plus size={18} /> ADD NEW ITEM ROW
            </button>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-widest text-gray-400">Automation</h4>
            <input title='CSV Upload' ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all w-full justify-center shadow-md active:scale-95">
              <Upload size={18} /> BATCH CSV UPLOAD
            </button>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-widest text-gray-400">Resources</h4>
            <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold transition-all w-full justify-center shadow-md active:scale-95">
              <Download size={18} /> DOWNLOAD TEMPLATE
            </button>
          </div>
        </div>
      </div>

      <div className={`rounded-xl overflow-hidden border shadow-xl ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className={`text-left text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'bg-gray-750 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                <th className="px-4 py-3 w-12 text-center">S.No</th>
                <th className="px-4 py-3">Item Details *</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit *</th>
                <th className="px-4 py-3">HSN Code</th>
                <th className="px-4 py-3 text-center">Auto-Barcode</th>
                <th className="px-4 py-3">GST Ledgers (I/C/S)</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {bulkItems.map((item, index) => (
                <tr key={item.tempId} className={`transition-colors ${theme === 'dark' ? 'hover:bg-gray-750/50' : 'hover:bg-blue-50/30'}`}>
                  <td className="px-4 py-3 text-center font-mono text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateRow(item.tempId, 'name', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all ${item.errors.name ? 'border-red-500 bg-red-50/10' : theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                      placeholder="Item name (required)"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      title='Category'
                      value={item.stockGroupId || ''}
                      onChange={(e) => updateRow(item.tempId, 'stockGroupId', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all ${item.errors.stockGroupId ? 'border-red-500 bg-red-50/10 animate-pulse' : theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                    >
                      <option value="">-- Category --</option>
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      title='Unit'
                      value={item.unit}
                      onChange={(e) => updateRow(item.tempId, 'unit', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all ${item.errors.unit ? 'border-red-500 bg-red-50/10 animate-pulse' : theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                    >
                      <option value="">-- Unit --</option>
                      {units.map(unit => (
                        <option key={unit.value} value={unit.value}>{unit.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={item.hsnCode || ''}
                      onChange={(e) => updateRow(item.tempId, 'hsnCode', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                      placeholder="HSN/SAC"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                       <input
                        type="text"
                        value={item.barcode}
                        onChange={(e) => updateRow(item.tempId, 'barcode', e.target.value)}
                        className={`w-full font-mono text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-300'}`}
                        placeholder="Barcode"
                      />
                      <button 
                        onClick={() => updateRow(item.tempId, 'barcode', generateEAN13())}
                        className="p-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-lg transition-colors"
                        title="Regenerate Barcode"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <select
                        title='IGST'
                        value={item.gstLedgerId || ''}
                        onChange={(e) => updateRow(item.tempId, 'gstLedgerId', e.target.value)}
                        className={`w-full px-2 py-1 text-[10px] uppercase font-bold border rounded focus:ring-1 focus:ring-blue-500 ${item.errors.gstLedgerId ? 'border-red-500 bg-red-50/10' : theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                      >
                        <option value="">-- IGST --</option>
                        {deduplicateLedgers([...gstLedgers.gst, ...gstLedgers.igst]).map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-1">
                        <select
                          title='CGST'
                          value={item.cgstLedgerId || ''}
                          onChange={(e) => updateRow(item.tempId, 'cgstLedgerId', e.target.value)}
                          className={`w-full px-2 py-1 text-[10px] uppercase font-bold border rounded focus:ring-1 focus:ring-blue-500 ${item.errors.cgstLedgerId ? 'border-red-500 bg-red-50/10' : theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                        >
                          <option value="">-- CGST --</option>
                          {deduplicateLedgers(gstLedgers.cgst).map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                        <select
                          title='SGST'
                          value={item.sgstLedgerId || ''}
                          onChange={(e) => updateRow(item.tempId, 'sgstLedgerId', e.target.value)}
                          className={`w-full px-2 py-1 text-[10px] uppercase font-bold border rounded focus:ring-1 focus:ring-blue-500 ${item.errors.sgstLedgerId ? 'border-red-500 bg-red-50/10' : theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                        >
                          <option value="">-- SGST --</option>
                          {deduplicateLedgers(gstLedgers.sgst).map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => removeRow(item.tempId)}
                      disabled={bulkItems.length <= 1}
                      className={`p-2 rounded-lg transition-all ${bulkItems.length <= 1 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-red-500/10 text-red-500'}`}
                      title="Delete Entry"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000] p-6">
          <div className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-3xl border ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-100'}`}>
            <div className="p-6 border-b flex justify-between items-center bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-lg">
              <div className="flex flex-col">
                <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3">
                  <FileText size={28} className="animate-pulse" />
                  PREVIEW SUBMISSION
                </h3>
                <p className="text-xs text-blue-100 font-bold opacity-80 uppercase tracking-widest">Verifying {validItemsCount} items for final insertion</p>
              </div>
              <button title="Close" onClick={() => setShowPreview(false)} className="p-2 hover:bg-white/20 rounded-full transition-all active:scale-90">
                <X size={28} />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-6 bg-gray-50/30">
              {bulkItems.filter(item => item.isValid).map((item, i) => (
                <div key={item.tempId} className={`group p-6 rounded-2xl border transition-all hover:shadow-xl ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <div className="flex justify-between items-center mb-6 border-b border-dashed pb-4 border-gray-300">
                    <div className="flex gap-4 items-center">
                      <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-sm">{i + 1}</span>
                      <h4 className="font-black text-xl tracking-tight uppercase group-hover:text-blue-500 transition-colors">{item.name}</h4>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                       <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm flex flex-col items-center">
                          <Barcode value={item.barcode} width={0.8} height={30} fontSize={10} background="transparent" />
                       </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Category</span>
                      <p className="font-bold">{categories.find(c => c.value === item.stockGroupId)?.label || 'STANDARD'}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Packaging Unit</span>
                      <p className="font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md inline-block">{units.find(u => u.value === item.unit)?.label || item.unit}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tax ID (HSN)</span>
                      <p className="font-mono font-bold text-gray-600 dark:text-gray-300">{item.hsnCode || 'NONE'}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ledger Mapping</span>
                      <p className="text-[10px] leading-tight font-bold text-blue-600 uppercase">
                        I: {[...gstLedgers.gst, ...gstLedgers.igst].find(l => l.id.toString() === item.gstLedgerId)?.name || '-'}<br/>
                        C: {gstLedgers.cgst.find(l => l.id.toString() === item.cgstLedgerId)?.name || '-'}<br/>
                        S: {gstLedgers.sgst.find(l => l.id.toString() === item.sgstLedgerId)?.name || '-'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 border-t flex justify-end gap-4 bg-gray-50/80 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowPreview(false)} className="px-8 py-3 rounded-xl border-2 border-gray-300 font-black hover:bg-gray-100 transition-all uppercase text-xs tracking-widest active:scale-95">Discard</button>
              <button 
                onClick={() => { setShowPreview(false); handleSaveAll(bulkItems); }} 
                className="px-10 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black transition-all active:scale-95 shadow-xl shadow-blue-600/30 flex items-center gap-3 uppercase text-xs tracking-widest"
              >
                <Save size={20} />
                Confirm Insertion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkStockItemCreate;
