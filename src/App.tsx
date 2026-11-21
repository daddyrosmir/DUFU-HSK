import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { ImportModal } from './components/ImportModal';
import { ListToolsView } from './components/ListToolsView';
import { StatisticsView } from './components/StatisticsView';
import { StudyView } from './components/StudyView';
import { WordBanksView } from './components/WordBanksView';
import {
  AppView,
  ParsedWordRow,
  ReviewLogEntry,
  SwipeDirection,
  WordCard,
  WordGroup,
} from './types/flashcard';
import {
  convertNumberedPinyinToMarks,
  copyCardsToGroup,
  deduplicateCards,
  moveCardsToGroup,
  normalizeCardText,
} from './utils/listTools';
import { recordSwipeAnswer } from './utils/scheduler';
import { createId, loadAppState, saveAppState } from './utils/storage';

export default function App() {
  const [initialState] = useState(() => loadAppState());
  const [groups, setGroups] = useState<WordGroup[]>(initialState.groups);
  const [cards, setCards] = useState<WordCard[]>(initialState.cards);
  const [reviewLog, setReviewLog] = useState<ReviewLogEntry[]>(initialState.reviewLog);
  const [activeStudyGroupId, setActiveStudyGroupId] = useState<string | 'all'>(
    initialState.activeGroupId
  );
  const [selectedBankGroupId, setSelectedBankGroupId] = useState<string>(
    initialState.activeGroupId !== 'all'
      ? initialState.activeGroupId
      : initialState.groups[0]?.id ?? ''
  );

  const [activeView, setActiveView] = useState<AppView>('study');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importTargetGroupId, setImportTargetGroupId] = useState<string>(
    initialState.groups[0]?.id ?? ''
  );

  useEffect(() => {
    saveAppState({
      groups,
      cards,
      reviewLog,
      activeGroupId: activeStudyGroupId,
    });
  }, [groups, cards, reviewLog, activeStudyGroupId]);

  const handleSwipeCard = (cardId: string, direction: SwipeDirection) => {
    const now = Date.now();
    let swipedCard: WordCard | undefined;
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        swipedCard = recordSwipeAnswer(card, direction, now);
        return swipedCard;
      })
    );

    const target = cards.find((c) => c.id === cardId);
    if (target) {
      setReviewLog((prev) => [
        {
          id: createId('rev'),
          cardId: target.id,
          groupId: target.groupId,
          hanzi: target.hanzi,
          result: direction,
          timestamp: now,
        },
        ...prev.slice(0, 499),
      ]);
    }
  };

  const handleCreateGroup = (name: string, description: string): string => {
    const id = createId('group');
    const newGroup: WordGroup = {
      id,
      name,
      description,
      createdAt: Date.now(),
    };
    setGroups((prev) => [...prev, newGroup]);
    return id;
  };

  const handleRenameGroup = (groupId: string, name: string, description: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name, description } : g))
    );
  };

  const handleDeleteGroup = (groupId: string) => {
    const remainingGroups = groups.filter((g) => g.id !== groupId);
    setGroups(remainingGroups);
    setCards((prev) => prev.filter((c) => c.groupId !== groupId));
    if (selectedBankGroupId === groupId) {
      setSelectedBankGroupId(remainingGroups[0]?.id ?? '');
    }
    if (activeStudyGroupId === groupId) {
      setActiveStudyGroupId(remainingGroups[0]?.id ?? 'all');
    }
  };

  const handleAddWord = (word: {
    hanzi: string;
    pinyin: string;
    translation: string;
    notes?: string;
    groupId: string;
  }) => {
    const newCard: WordCard = {
      id: createId('card'),
      hanzi: word.hanzi,
      pinyin: word.pinyin,
      translation: word.translation,
      notes: word.notes,
      groupId: word.groupId,
      rightCount: 0,
      wrongCount: 0,
      lastReviewedAt: null,
      createdAt: Date.now(),
    };
    setCards((prev) => [...prev, newCard]);
  };

  const handleUpdateWord = (cardId: string, patch: Partial<WordCard>) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));
  };

  const handleDeleteWords = (cardIds: string[]) => {
    const removeSet = new Set(cardIds);
    setCards((prev) => prev.filter((c) => !removeSet.has(c.id)));
  };

  const handleMoveWords = (cardIds: string[], targetGroupId: string) => {
    setCards((prev) => moveCardsToGroup(prev, new Set(cardIds), targetGroupId));
  };

  const handleCopyWords = (cardIds: string[], targetGroupId: string) => {
    setCards((prev) =>
      copyCardsToGroup(prev, new Set(cardIds), targetGroupId, () => createId('card'))
    );
  };

  const handleConfirmImport = ({
    rows,
    targetGroupId,
    newGroupName,
    splitByHskLevel,
    skipDuplicates,
  }: {
    rows: (ParsedWordRow & { hskLevel?: number })[];
    targetGroupId: string;
    newGroupName?: string;
    splitByHskLevel?: boolean;
    skipDuplicates: boolean;
  }) => {
    const now = Date.now();
    const createdGroups: WordGroup[] = [];
    const existingGroupByLowerName = new Map(
      groups.map((g) => [g.name.toLowerCase(), g.id])
    );

    let singleResolvedGroupId = targetGroupId;
    if (!splitByHskLevel && newGroupName) {
      singleResolvedGroupId = createId('group');
      createdGroups.push({
        id: singleResolvedGroupId,
        name: newGroupName,
        description: 'Imported vocabulary group',
        createdAt: now,
      });
    }

    const existingHanziByGroup = new Map<string, Set<string>>();
    const getGroupHanziSet = (gid: string) => {
      let set = existingHanziByGroup.get(gid);
      if (!set) {
        set = new Set(
          cards.filter((c) => c.groupId === gid).map((c) => c.hanzi.trim())
        );
        existingHanziByGroup.set(gid, set);
      }
      return set;
    };

    const newCards: WordCard[] = [];
    let firstTouchedGroupId = singleResolvedGroupId;

    rows.forEach((row, index) => {
      let resolvedGroupId = singleResolvedGroupId;

      if (splitByHskLevel && row.hskLevel) {
        const levelGroupName = `HSK Level ${row.hskLevel}`;
        const key = levelGroupName.toLowerCase();
        const existingId = existingGroupByLowerName.get(key);
        if (existingId) {
          resolvedGroupId = existingId;
        } else {
          const newId = createId('group');
          existingGroupByLowerName.set(key, newId);
          createdGroups.push({
            id: newId,
            name: levelGroupName,
            description: `Official HSK Level ${row.hskLevel} vocabulary list`,
            createdAt: now + row.hskLevel,
          });
          resolvedGroupId = newId;
        }
      }

      if (!firstTouchedGroupId) {
        firstTouchedGroupId = resolvedGroupId;
      }

      const hanzi = row.hanzi.trim();
      const groupSet = getGroupHanziSet(resolvedGroupId);
      if (skipDuplicates && groupSet.has(hanzi)) {
        return;
      }
      groupSet.add(hanzi);

      newCards.push({
        id: createId('card'),
        hanzi,
        pinyin: row.pinyin.trim(),
        translation: row.translation.trim(),
        notes: row.notes?.trim() || undefined,
        groupId: resolvedGroupId,
        rightCount: 0,
        wrongCount: 0,
        lastReviewedAt: null,
        createdAt: now + index,
      });
    });

    if (createdGroups.length > 0) {
      setGroups((prev) => [...prev, ...createdGroups]);
    }
    if (newCards.length > 0) {
      setCards((prev) => [...prev, ...newCards]);
    }
    const focusGroupId =
      splitByHskLevel && createdGroups.length > 0
        ? createdGroups[0].id
        : firstTouchedGroupId;
    if (focusGroupId) {
      setSelectedBankGroupId(focusGroupId);
      setActiveStudyGroupId(focusGroupId);
    }
  };

  const handleDeduplicateScope = (scopeGroupId: string | 'all'): number => {
    const res = deduplicateCards(cards, scopeGroupId);
    setCards(res.cards);
    return res.removedCount;
  };

  const handleNormalizeScope = (scopeGroupId: string | 'all'): number => {
    let count = 0;
    setCards((prev) =>
      prev.map((card) => {
        if (scopeGroupId !== 'all' && card.groupId !== scopeGroupId) return card;
        const cleaned = normalizeCardText(card);
        if (
          cleaned.hanzi !== card.hanzi ||
          cleaned.pinyin !== card.pinyin ||
          cleaned.translation !== card.translation ||
          cleaned.notes !== card.notes
        ) {
          count += 1;
          return cleaned;
        }
        return card;
      })
    );
    return count;
  };

  const handleConvertPinyinScope = (scopeGroupId: string | 'all'): number => {
    let count = 0;
    setCards((prev) =>
      prev.map((card) => {
        if (scopeGroupId !== 'all' && card.groupId !== scopeGroupId) return card;
        const converted = convertNumberedPinyinToMarks(card.pinyin);
        if (converted !== card.pinyin) {
          count += 1;
          return { ...card, pinyin: converted };
        }
        return card;
      })
    );
    return count;
  };

  const handleMergeGroups = (
    sourceGroupId: string,
    targetGroupId: string,
    deleteSource: boolean
  ) => {
    if (sourceGroupId === targetGroupId) return;
    setCards((prev) =>
      prev.map((c) => (c.groupId === sourceGroupId ? { ...c, groupId: targetGroupId } : c))
    );
    if (deleteSource) {
      setGroups((prev) => prev.filter((g) => g.id !== sourceGroupId));
      if (selectedBankGroupId === sourceGroupId) setSelectedBankGroupId(targetGroupId);
      if (activeStudyGroupId === sourceGroupId) setActiveStudyGroupId(targetGroupId);
    }
  };

  const handleResetAllStats = () => {
    setCards((prev) =>
      prev.map((c) => ({
        ...c,
        rightCount: 0,
        wrongCount: 0,
        lastReviewedAt: null,
      }))
    );
    setReviewLog([]);
  };

  const openImportForGroup = (groupId?: string) => {
    const fallback =
      groupId && groupId !== 'all'
        ? groupId
        : activeView === 'banks' && selectedBankGroupId
        ? selectedBankGroupId
        : activeStudyGroupId !== 'all'
        ? activeStudyGroupId
        : groups[0]?.id ?? '';
    setImportTargetGroupId(fallback);
    setIsImportOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header
        activeView={activeView}
        onNavigate={setActiveView}
        onOpenImport={() => openImportForGroup()}
      />

      <main className="flex-1">
        {activeView === 'study' && (
          <StudyView
            groups={groups}
            cards={cards}
            activeGroupId={activeStudyGroupId}
            onChangeActiveGroup={setActiveStudyGroupId}
            onSwipeCard={handleSwipeCard}
            onOpenImport={() => openImportForGroup()}
            onGoToBanks={() => setActiveView('banks')}
          />
        )}

        {activeView === 'banks' && (
          <WordBanksView
            groups={groups}
            cards={cards}
            selectedGroupId={selectedBankGroupId}
            onSelectGroup={setSelectedBankGroupId}
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
            onAddWord={handleAddWord}
            onUpdateWord={handleUpdateWord}
            onDeleteWords={handleDeleteWords}
            onMoveWords={handleMoveWords}
            onCopyWords={handleCopyWords}
            onStudyGroup={(groupId) => {
              setActiveStudyGroupId(groupId);
              setActiveView('study');
            }}
            onOpenImport={(groupId) => openImportForGroup(groupId)}
          />
        )}

        {activeView === 'tools' && (
          <ListToolsView
            groups={groups}
            cards={cards}
            onDeduplicateScope={handleDeduplicateScope}
            onNormalizeScope={handleNormalizeScope}
            onConvertPinyinScope={handleConvertPinyinScope}
            onMergeGroups={handleMergeGroups}
          />
        )}

        {activeView === 'statistics' && (
          <StatisticsView
            groups={groups}
            cards={cards}
            reviewLog={reviewLog}
            onStudyGroup={(groupId) => {
              setActiveStudyGroupId(groupId);
              setActiveView('study');
            }}
            onResetAllStats={handleResetAllStats}
          />
        )}
      </main>

      {isImportOpen && (
        <ImportModal
          isOpen={isImportOpen}
          groups={groups}
          existingCards={cards}
          defaultGroupId={importTargetGroupId}
          onClose={() => setIsImportOpen(false)}
          onConfirmImport={handleConfirmImport}
        />
      )}
    </div>
  );
}
