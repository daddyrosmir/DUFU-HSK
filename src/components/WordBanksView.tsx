import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  FolderPlus,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { WordCard, WordGroup } from '../types/flashcard';
import { convertNumberedPinyinToMarks } from '../utils/listTools';
import { calculateGroupStats, getCardAccuracy, sortCardsByFewestRightFirst } from '../utils/scheduler';

interface WordBanksViewProps {
  groups: WordGroup[];
  cards: WordCard[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: (name: string, description: string) => string;
  onRenameGroup: (groupId: string, name: string, description: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddWord: (word: {
    hanzi: string;
    pinyin: string;
    translation: string;
    notes?: string;
    groupId: string;
  }) => void;
  onUpdateWord: (cardId: string, patch: Partial<WordCard>) => void;
  onDeleteWords: (cardIds: string[]) => void;
  onMoveWords: (cardIds: string[], targetGroupId: string) => void;
  onCopyWords: (cardIds: string[], targetGroupId: string) => void;
  onStudyGroup: (groupId: string) => void;
  onOpenImport: (groupId: string) => void;
}

type SortMode = 'fewest-right' | 'most-wrong' | 'hanzi' | 'newest';

export function WordBanksView({
  groups,
  cards,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onAddWord,
  onUpdateWord,
  onDeleteWords,
  onMoveWords,
  onCopyWords,
  onStudyGroup,
  onOpenImport,
}: WordBanksViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('fewest-right');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // New group inline form
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // Rename active group inline state
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  // Add single word inline form
  const [newHanzi, setNewHanzi] = useState('');
  const [newPinyin, setNewPinyin] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Inline row edit state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editRowHanzi, setEditRowHanzi] = useState('');
  const [editRowPinyin, setEditRowPinyin] = useState('');
  const [editRowTranslation, setEditRowTranslation] = useState('');
  const [editRowNotes, setEditRowNotes] = useState('');

  // Bulk target group
  const [bulkTargetGroupId, setBulkTargetGroupId] = useState<string>('');

  const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0];
  const effectiveGroupId = activeGroup?.id ?? '';

  const groupCards = useMemo(() => {
    const base = cards.filter((c) => c.groupId === effectiveGroupId);
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? base.filter(
          (c) =>
            c.hanzi.toLowerCase().includes(q) ||
            c.pinyin.toLowerCase().includes(q) ||
            c.translation.toLowerCase().includes(q) ||
            (c.notes ?? '').toLowerCase().includes(q)
        )
      : base;

    if (sortMode === 'fewest-right') {
      return sortCardsByFewestRightFirst(filtered);
    }
    if (sortMode === 'most-wrong') {
      return [...filtered].sort((a, b) => b.wrongCount - a.wrongCount);
    }
    if (sortMode === 'hanzi') {
      return [...filtered].sort((a, b) => a.hanzi.localeCompare(b.hanzi, 'zh-CN'));
    }
    return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
  }, [cards, effectiveGroupId, searchQuery, sortMode]);

  const activeStats = useMemo(
    () => calculateGroupStats(cards, effectiveGroupId),
    [cards, effectiveGroupId]
  );

  const otherGroups = groups.filter((g) => g.id !== effectiveGroupId);
  const resolvedBulkTarget =
    bulkTargetGroupId && otherGroups.some((g) => g.id === bulkTargetGroupId)
      ? bulkTargetGroupId
      : otherGroups[0]?.id ?? '';

  const allVisibleSelected =
    groupCards.length > 0 && groupCards.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(groupCards.map((c) => c.id)));
    }
  };

  const toggleRowSelection = (cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const handleCreateGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const createdId = onCreateGroup(newGroupName.trim(), newGroupDesc.trim());
    setNewGroupName('');
    setNewGroupDesc('');
    setIsCreatingGroup(false);
    setSelectedIds(new Set());
    onSelectGroup(createdId);
  };

  const handleAddWordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!newHanzi.trim()) {
      setAddError('Hanzi characters are required.');
      return;
    }
    if (!newTranslation.trim() && !newPinyin.trim()) {
      setAddError('Enter Pinyin or Translation for the back of the card.');
      return;
    }
    if (!effectiveGroupId) return;

    onAddWord({
      hanzi: newHanzi.trim(),
      pinyin: convertNumberedPinyinToMarks(newPinyin.trim()),
      translation: newTranslation.trim(),
      notes: newNotes.trim() || undefined,
      groupId: effectiveGroupId,
    });
    setNewHanzi('');
    setNewPinyin('');
    setNewTranslation('');
    setNewNotes('');
  };

  const beginEditRow = (card: WordCard) => {
    setEditingCardId(card.id);
    setEditRowHanzi(card.hanzi);
    setEditRowPinyin(card.pinyin);
    setEditRowTranslation(card.translation);
    setEditRowNotes(card.notes ?? '');
  };

  const saveEditRow = (cardId: string) => {
    if (!editRowHanzi.trim()) return;
    onUpdateWord(cardId, {
      hanzi: editRowHanzi.trim(),
      pinyin: editRowPinyin.trim(),
      translation: editRowTranslation.trim(),
      notes: editRowNotes.trim() || undefined,
    });
    setEditingCardId(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar: User-Created Word Bank Groups */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Word Bank Groups</h2>
              <button
                type="button"
                onClick={() => setIsCreatingGroup((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md whitespace-nowrap transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Group</span>
              </button>
            </div>

            {isCreatingGroup && (
              <form
                onSubmit={handleCreateGroupSubmit}
                className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
              >
                <div>
                  <label htmlFor="new-group-name-input" className="sr-only">
                    Group name
                  </label>
                  <input
                    id="new-group-name-input"
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group name (e.g. HSK 2)"
                    required
                    className="w-full h-9 px-2.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="new-group-desc-input" className="sr-only">
                    Description
                  </label>
                  <input
                    id="new-group-desc-input"
                    type="text"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="Short description (optional)"
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingGroup(false)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <ul className="mt-3 space-y-1">
              {groups.map((group) => {
                const stats = calculateGroupStats(cards, group.id);
                const isSelected = group.id === effectiveGroupId;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectGroup(group.id);
                        setSelectedIds(new Set());
                        setIsEditingGroup(false);
                        setConfirmDeleteGroupId(null);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900 border border-blue-200'
                          : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{group.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          {stats.totalCards} word{stats.totalCards === 1 ? '' : 's'} ·{' '}
                          {stats.totalReviews > 0 ? `${stats.accuracyPercent}% accuracy` : 'New'}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Main Area: Active Group Words & Management */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-5">
          {activeGroup && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
              {/* Group Header */}
              {isEditingGroup ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="edit-group-name" className="block text-xs font-medium text-slate-600 mb-1">
                        Group Name
                      </label>
                      <input
                        id="edit-group-name"
                        type="text"
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-group-desc" className="block text-xs font-medium text-slate-600 mb-1">
                        Description
                      </label>
                      <input
                        id="edit-group-desc"
                        type="text"
                        value={editGroupDesc}
                        onChange={(e) => setEditGroupDesc(e.target.value)}
                        className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (editGroupName.trim()) {
                          onRenameGroup(activeGroup.id, editGroupName.trim(), editGroupDesc.trim());
                          setIsEditingGroup(false);
                        }
                      }}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                    >
                      Save Group
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingGroup(false)}
                      className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-semibold text-slate-900">{activeGroup.name}</h1>
                      <button
                        type="button"
                        aria-label={`Edit group ${activeGroup.name}`}
                        onClick={() => {
                          setEditGroupName(activeGroup.name);
                          setEditGroupDesc(activeGroup.description);
                          setIsEditingGroup(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                      >
                        <Edit3 className="w-4 h-4" aria-hidden="true" />
                      </button>
                      {groups.length > 1 && (
                        confirmDeleteGroupId === activeGroup.id ? (
                          <div className="inline-flex items-center gap-1.5 ml-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteGroup(activeGroup.id);
                                setConfirmDeleteGroupId(null);
                              }}
                              className="px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGroupId(null)}
                              className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Delete group ${activeGroup.name}`}
                            onClick={() => setConfirmDeleteGroupId(activeGroup.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      {activeGroup.description || 'User-created Chinese vocabulary group.'} ·{' '}
                      <span className="tabular-nums">
                        {activeStats.totalCards} {activeStats.totalCards === 1 ? 'card' : 'cards'} ·{' '}
                        {activeStats.masteredCount} mastered
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenImport(activeGroup.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap transition-colors"
                    >
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      <span>Import to Group</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onStudyGroup(activeGroup.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap transition-colors"
                    >
                      <Play className="w-4 h-4" aria-hidden="true" />
                      <span>Study Group</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Add Single Word Form */}
              <form
                onSubmit={handleAddWordSubmit}
                className="mt-5 pt-5 border-t border-slate-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Quick Add Word to {activeGroup.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewPinyin((p) => convertNumberedPinyinToMarks(p))}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-blue-700"
                  >
                    <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Convert tone numbers (e.g. ni3 → nǐ)</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-2">
                    <label htmlFor="quick-add-hanzi" className="sr-only">
                      Hanzi
                    </label>
                    <input
                      id="quick-add-hanzi"
                      type="text"
                      value={newHanzi}
                      onChange={(e) => setNewHanzi(e.target.value)}
                      placeholder="Hanzi (e.g. 电脑)"
                      className="w-full h-10 px-3 text-sm font-hanzi bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor="quick-add-pinyin" className="sr-only">
                      Pinyin
                    </label>
                    <input
                      id="quick-add-pinyin"
                      type="text"
                      value={newPinyin}
                      onChange={(e) => setNewPinyin(e.target.value)}
                      placeholder="Pinyin (e.g. diànnǎo)"
                      className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor="quick-add-translation" className="sr-only">
                      Translation
                    </label>
                    <input
                      id="quick-add-translation"
                      type="text"
                      value={newTranslation}
                      onChange={(e) => setNewTranslation(e.target.value)}
                      placeholder="Translation (e.g. computer)"
                      className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-4 flex gap-2">
                    <input
                      aria-label="Optional note"
                      type="text"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Note (optional)"
                      className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
                {addError && (
                  <p role="alert" className="text-xs text-rose-600 mt-2">
                    {addError}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* Word List Toolbar + Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search words in group"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter hanzi, pinyin, or translation..."
                  className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="word-sort-select" className="text-xs font-medium text-slate-600">
                  Sort
                </label>
                <select
                  id="word-sort-select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="h-9 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="fewest-right">Fewest Right First</option>
                  <option value="most-wrong">Most Wrong First</option>
                  <option value="hanzi">Hanzi A–Z</option>
                  <option value="newest">Newest Added</option>
                </select>
              </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-blue-900 tabular-nums">
                  {selectedIds.size} word{selectedIds.size === 1 ? '' : 's'} selected
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {otherGroups.length > 0 && (
                    <>
                      <select
                        aria-label="Target group for bulk move or copy"
                        value={resolvedBulkTarget}
                        onChange={(e) => setBulkTargetGroupId(e.target.value)}
                        className="h-8 px-2 text-xs bg-white border border-blue-200 rounded-md"
                      >
                        {otherGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          onMoveWords(Array.from(selectedIds), resolvedBulkTarget);
                          setSelectedIds(new Set());
                        }}
                        className="px-2.5 py-1.5 font-medium text-blue-800 bg-white border border-blue-200 hover:bg-blue-100 rounded-md"
                      >
                        Move to Group
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onCopyWords(Array.from(selectedIds), resolvedBulkTarget);
                          setSelectedIds(new Set());
                        }}
                        className="px-2.5 py-1.5 font-medium text-blue-800 bg-white border border-blue-200 hover:bg-blue-100 rounded-md"
                      >
                        Copy to Group
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteWords(Array.from(selectedIds));
                      setSelectedIds(new Set());
                    }}
                    className="px-2.5 py-1.5 font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-md"
                  >
                    Delete Selected
                  </button>
                </div>
              </div>
            )}

            {/* Words Data Table */}
            {groupCards.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-slate-900">
                  {searchQuery ? 'No words match your search' : 'This word bank group is empty'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {searchQuery
                    ? 'Try clearing the filter above.'
                    : 'Use the Quick Add bar above or click Import to Group.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                      <th className="py-2.5 px-4 w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all visible words"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                      </th>
                      <th className="py-2.5 px-3">Hanzi</th>
                      <th className="py-2.5 px-3">Pinyin</th>
                      <th className="py-2.5 px-3">Translation</th>
                      <th className="py-2.5 px-3 text-right">Right</th>
                      <th className="py-2.5 px-3 text-right">Wrong</th>
                      <th className="py-2.5 px-3 text-right">Accuracy</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {groupCards.map((card) => {
                      const isEditing = editingCardId === card.id;
                      const acc = getCardAccuracy(card);
                      return (
                        <tr key={card.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-4">
                            <input
                              type="checkbox"
                              aria-label={`Select ${card.hanzi}`}
                              checked={selectedIds.has(card.id)}
                              onChange={() => toggleRowSelection(card.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                            />
                          </td>

                          {isEditing ? (
                            <>
                              <td className="py-1.5 px-3">
                                <input
                                  type="text"
                                  aria-label="Edit hanzi"
                                  value={editRowHanzi}
                                  onChange={(e) => setEditRowHanzi(e.target.value)}
                                  className="w-28 h-8 px-2 text-sm font-hanzi border border-slate-300 rounded"
                                />
                              </td>
                              <td className="py-1.5 px-3">
                                <input
                                  type="text"
                                  aria-label="Edit pinyin"
                                  value={editRowPinyin}
                                  onChange={(e) => setEditRowPinyin(e.target.value)}
                                  className="w-32 h-8 px-2 text-sm border border-slate-300 rounded"
                                />
                              </td>
                              <td className="py-1.5 px-3">
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    aria-label="Edit translation"
                                    value={editRowTranslation}
                                    onChange={(e) => setEditRowTranslation(e.target.value)}
                                    className="w-40 h-8 px-2 text-sm border border-slate-300 rounded"
                                  />
                                  <input
                                    type="text"
                                    aria-label="Edit notes"
                                    value={editRowNotes}
                                    onChange={(e) => setEditRowNotes(e.target.value)}
                                    placeholder="Note"
                                    className="w-28 h-8 px-2 text-xs border border-slate-300 rounded"
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                                {card.rightCount}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                                {card.wrongCount}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                                {acc === null ? '—' : `${acc}%`}
                              </td>
                              <td className="py-2 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  aria-label={`Save ${card.hanzi}`}
                                  onClick={() => saveEditRow(card.id)}
                                  className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded mr-1"
                                >
                                  <Check className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Cancel editing ${card.hanzi}`}
                                  onClick={() => setEditingCardId(null)}
                                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                                >
                                  <X className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2.5 px-3 font-hanzi text-base font-medium text-slate-900 whitespace-nowrap">
                                {card.hanzi}
                              </td>
                              <td className="py-2.5 px-3 text-blue-700 font-medium whitespace-nowrap">
                                {card.pinyin || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">
                                <span>{card.translation}</span>
                                {card.notes && (
                                  <span className="block text-xs text-slate-400">
                                    {card.notes}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs text-emerald-700">
                                {card.rightCount}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs text-rose-700">
                                {card.wrongCount}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-mono text-xs text-slate-600">
                                {acc === null ? '—' : `${acc}%`}
                              </td>
                              <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  aria-label={`Edit ${card.hanzi}`}
                                  onClick={() => beginEditRow(card)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors mr-1"
                                >
                                  <Edit3 className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${card.hanzi}`}
                                  onClick={() => onDeleteWords([card.id])}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
