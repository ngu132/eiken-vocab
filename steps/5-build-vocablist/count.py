from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Iterable

import spacy
from spacy.tokens import Doc, Token

# -------------------------
# Normalization
# -------------------------

def _norm_arg(tok: Token) -> str:
    """連語の引数側を軽く正規化（置換しすぎない）。"""
    if tok.is_punct or tok.is_space:
        return "<PUNCT>"
    if tok.ent_type_:
        return f"<NE:{tok.ent_type_}>"
    if tok.pos_ == "PRON":
        return "<PRON>"
    if tok.like_num:
        return "<NUM>"
    if tok.tag_ == "VBG":
        return "<V-ing>"
    return tok.lemma_.lower()


# -------------------------
# Unigrams
# -------------------------

def _iter_unigrams(doc: Doc) -> Iterable[str]:
    for tok in doc:
        if tok.is_space or tok.is_punct:
            continue
        if not tok.is_alpha:
            continue
        # 固有名詞を除外
        if tok.pos_ == "PROPN":
            continue
        # 固有表現も除外したいなら（より強い）
        if tok.ent_type_:
            continue

        lemma = tok.lemma_.lower()
        if not lemma:
            continue
        yield lemma


# -------------------------
# Phrase bundles
# -------------------------

def _iter_noun_compounds(doc: Doc) -> Iterable[str]:
    for head in doc:
        if head.pos_ != "NOUN":   # PROPNを排除
            continue
        mods = [
            c for c in head.children
            if c.dep_ == "compound" and c.pos_ == "NOUN" and not c.is_punct  # PROPN排除
        ]
        if not mods:
            continue
        mods_sorted = sorted(mods, key=lambda t: t.i)
        phrase = " ".join([m.lemma_.lower() for m in mods_sorted] + [head.lemma_.lower()])
        yield phrase



def _iter_bundles(doc: Doc) -> Iterable[str]:
    """
    学習向きの「束ねた」連語だけを返す。
    - 句動詞: give up / give up O（分離も統合）
    - head + prep + comp: depend on O / look to <V-ing> など
    - verb + mod + prep + comp: look forward to <V-ing> など
    - 名詞複合: high school student / data science など
    """
    # --- 1) phrasal verb: verb + prt (+ obj template) ---
    for v in doc:
        if v.pos_ != "VERB":
            continue
        prts = [c for c in v.children if c.dep_ == "prt" and not c.is_punct]
        if not prts:
            continue

        pv_list = [f"{v.lemma_.lower()} {p.lemma_.lower()}" for p in prts]
        objs = [c for c in v.children if c.dep_ == "obj" and not c.is_punct]

        for pv in pv_list:
            yield pv
            if objs:
                for o in objs:
                    on = _norm_arg(o)
                    if on == "<PRON>" or on.startswith("<NE:") or on == "<V-ing>":
                        yield f"{pv} {on}"
                    else:
                        yield f"{pv} O"

    # --- 2) head + prep + comp ---
    HEAD_POS = {"VERB", "ADJ", "NOUN", "PROPN", "ADV"}
    for head in doc:
        if head.pos_ not in HEAD_POS:
            continue

        preps = [c for c in head.children if c.dep_ == "prep" and c.pos_ == "ADP" and not c.is_punct]
        for prep in preps:
            comps = [c for c in prep.children if c.dep_ in ("pobj", "pcomp", "obl", "obj") and not c.is_punct]
            for comp in comps:
                x = f"{head.lemma_.lower()} {prep.lemma_.lower()}"
                yn = _norm_arg(comp)
                if yn in ("<PRON>", "<V-ing>") or yn.startswith("<NE:"):
                    yield f"{x} {yn}"
                else:
                    yield f"{x} O"

    # --- 3) verb + mod + prep + comp (一般化) ---
    MOD_DEPS = {"advmod", "compound", "acomp"}
    for v in doc:
        if v.pos_ != "VERB":
            continue
        mods = [m for m in v.children if m.dep_ in MOD_DEPS and not m.is_punct]
        for m in mods:
            preps = [c for c in m.children if c.dep_ == "prep" and c.pos_ == "ADP" and not c.is_punct]
            for prep in preps:
                comps = [c for c in prep.children if c.dep_ in ("pobj", "pcomp", "obl", "obj") and not c.is_punct]
                for comp in comps:
                    x = f"{v.lemma_.lower()} {m.lemma_.lower()} {prep.lemma_.lower()}"
                    yn = _norm_arg(comp)
                    if yn in ("<PRON>", "<V-ing>") or yn.startswith("<NE:"):
                        yield f"{x} {yn}"
                    else:
                        yield f"{x} O"

    # --- 4) noun compounds ---
    yield from _iter_noun_compounds(doc)


def _iter_edges(doc: Doc) -> Iterable[str]:
    """依存edgeも全部数えたいとき用（出力は多い）。"""
    for child in doc:
        if child.is_space or child.is_punct:
            continue
        head = child.head
        if head == child:
            continue
        dep = child.dep_
        x = f"{head.lemma_.lower()}:{head.pos_}"
        y = _norm_arg(child)
        yield f"edge:{dep} {x} -> {y}"


# -------------------------
# Result type
# -------------------------

@dataclass
class CountResult:
    unigram: Counter[str]
    unigram_n: int
    phrase: Counter[str]
    phrase_n: int


# -------------------------
# Main
# -------------------------

def count_collocations(
    texts: Iterable[str],
    *,
    nlp: spacy.language.Language,
    batch_size: int = 256,
    n_process: int = 1,
    include_edges: bool = False,
) -> CountResult:
    """
    - unigram: lemma単語の頻度
    - phrase: bundle（+ optional edges）の頻度
    - *_n: それぞれの「候補イベント総数」（= そのレーンでカウントした総回数）
    """
    unigram_counter: Counter[str] = Counter()
    phrase_counter: Counter[str] = Counter()
    unigram_n = 0
    phrase_n = 0

    for doc in nlp.pipe(texts, batch_size=batch_size, n_process=n_process):
        for w in _iter_unigrams(doc):
            unigram_counter[w] += 1
            unigram_n += 1

        for p in _iter_bundles(doc):
            phrase_counter[p] += 1
            phrase_n += 1

        if include_edges:
            for e in _iter_edges(doc):
                phrase_counter[e] += 1
                phrase_n += 1

    return CountResult(
        unigram=unigram_counter,
        unigram_n=unigram_n,
        phrase=phrase_counter,
        phrase_n=phrase_n,
    )
