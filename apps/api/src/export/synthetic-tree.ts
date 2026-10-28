import type { TreeMember, TreeRelationship } from './tree-layout.ts';

// Deterministic synthetic family trees for export tests and measurements. Names are generated
// ("Person 12"), never real data. A seeded generator keeps every run identical.

export interface SyntheticTree {
  members: TreeMember[];
  relationships: TreeRelationship[];
}

function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

const uuid = (prefix: number, i: number) => `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;

class Builder {
  readonly members: TreeMember[] = [];
  readonly relationships: TreeRelationship[] = [];
  readonly #prefix: number;

  constructor(prefix: number) {
    this.#prefix = prefix;
  }

  person(name?: string): string {
    const id = uuid(this.#prefix, this.members.length + 1);
    this.members.push({ id, name: name ?? `Person ${this.members.length + 1}` });
    return id;
  }

  parent(parent: string, child: string): void {
    this.relationships.push({ id: uuid(this.#prefix + 1, this.relationships.length + 1), type: 'parent_of', from: parent, to: child });
  }

  spouse(a: string, b: string): void {
    this.relationships.push({ id: uuid(this.#prefix + 1, this.relationships.length + 1), type: 'spouse_of', from: a, to: b });
  }
}

/** One couple with `children` children, each married. */
export function wideTree(children: number): SyntheticTree {
  const b = new Builder(0xa1);
  const p1 = b.person();
  const p2 = b.person();
  b.spouse(p1, p2);
  for (let i = 0; i < children; i += 1) {
    const c = b.person();
    b.parent(p1, c);
    b.parent(p2, c);
    b.spouse(c, b.person());
  }
  return b;
}

/** A line of `generations` couples, each with one child who continues the line and one who does not. */
export function deepTree(generations: number): SyntheticTree {
  const b = new Builder(0xb1);
  let a = b.person();
  let s = b.person();
  b.spouse(a, s);
  for (let g = 1; g < generations; g += 1) {
    const heir = b.person();
    const sibling = b.person();
    for (const c of [heir, sibling]) {
      b.parent(a, c);
      b.parent(s, c);
    }
    a = heir;
    s = b.person();
    b.spouse(a, s);
  }
  return b;
}

/**
 * A realistic random family of about `size` members: couples with 0–5 children over several
 * generations, some single parents, marriages between branches, remarriages, and a few people
 * without recorded relationships.
 */
export function randomFamily(size: number, seed = 7): SyntheticTree {
  const random = rng(seed);
  const b = new Builder(0xc1);
  const generationOf = new Map<string, number>();
  const spouseOf = new Map<string, string[]>();
  const marry = (x: string, y: string) => {
    b.spouse(x, y);
    spouseOf.set(x, [...(spouseOf.get(x) ?? []), y]);
    spouseOf.set(y, [...(spouseOf.get(y) ?? []), x]);
  };
  const add = (gen: number) => {
    const id = b.person();
    generationOf.set(id, gen);
    return id;
  };
  // About 2% are recorded without relationships yet.
  const loose = Math.floor(size * 0.02);
  const target = size - loose;
  const founder = add(0);
  marry(founder, add(0));
  const frontier: string[] = [founder];
  let cursor = 0;
  while (b.members.length < target && cursor < frontier.length) {
    const person = frontier[cursor]!;
    cursor += 1;
    const gen = generationOf.get(person)!;
    const roll = random();
    let partner = spouseOf.get(person)?.[0];
    if (!partner && roll < 0.85) {
      // Occasionally marry someone from another branch of the same generation.
      const cousins = frontier.filter((p) => generationOf.get(p) === gen && p !== person && !spouseOf.has(p));
      partner = random() < 0.04 && cousins.length > 0 ? cousins[Math.floor(random() * cousins.length)]! : add(gen);
      marry(person, partner);
    }
    // Early generations always continue, so the family grows instead of dying out.
    const children = gen < 2 ? 2 + Math.floor(random() * 4) : Math.floor(random() * 6);
    for (let i = 0; i < children && b.members.length < target; i += 1) {
      const child = add(gen + 1);
      b.parent(person, child);
      if (partner) {
        b.parent(partner, child);
      }
      frontier.push(child);
    }
    // A remarriage, with a child from the second marriage.
    if (partner && random() < 0.05 && b.members.length < target - 1) {
      const second = add(gen);
      marry(person, second);
      const child = add(gen + 1);
      b.parent(person, child);
      b.parent(second, child);
      frontier.push(child);
    }
  }
  // Further family groups if this one stopped growing, then the loose members.
  while (b.members.length < target) {
    const tail = randomFamily(Math.min(target - b.members.length, Math.max(2, Math.floor(size / 4))), seed + b.members.length);
    const offset = new Map(tail.members.map((m) => [m.id, b.person()]));
    for (const r of tail.relationships) {
      if (r.type === 'parent_of') {
        b.parent(offset.get(r.from)!, offset.get(r.to)!);
      } else {
        b.spouse(offset.get(r.from)!, offset.get(r.to)!);
      }
    }
  }
  while (b.members.length < size) {
    add(0);
  }
  return b;
}

const GUJARATI = { given: ['હીર', 'જયેશભાઈ', 'કિરણ', 'દક્ષા', 'ભાવેશ', 'પ્રિયંકા', 'મહેશ', 'નિર્મળા', 'હર્ષ', 'ક્રિષ્ના', 'સ્મિતા', 'રમેશચંદ્ર'], family: ['પટેલ', 'શાહ', 'દેસાઈ', 'મહેતા', 'ત્રિવેદી'] };
const DEVANAGARI = { given: ['हीर', 'राजेश', 'सुनीता', 'अर्जुन', 'प्रियंका', 'क्षितिज', 'श्रीकांत', 'वृंदा', 'त्र्यंबक', 'ज्योति', 'दृष्टि', 'कृष्णा'], family: ['पटेल', 'कुमार', 'शर्मा', 'त्रिपाठी', 'श्रीवास्तव'] };
const LATIN = { given: ['Heel', 'José', 'Ānand', 'Meera', 'Rohan', 'Zoë', 'Ishaan', 'Priyā', 'Kiran', 'Łucja', 'Dev', 'Ana-María'], family: ['Patel', 'Álvarez', 'Śarmā', 'Desai', "D'Souza", 'Mehta-Shah'] };

/**
 * Gives every member a realistic name, deterministically: Gujarati, Devanagari and Latin names
 * (with accents), some mixed-script names and some very long ones. Test data only.
 */
export function withIndianNames(tree: SyntheticTree, seed = 11): SyntheticTree {
  const random = rng(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const name = (i: number): string => {
    const r = random();
    if (i % 37 === 5) {
      return `${pick(LATIN.given)} ${pick(DEVANAGARI.family)} (${pick(GUJARATI.given)})`;
    }
    if (i % 53 === 7) {
      return `${pick(GUJARATI.given)} ${pick(GUJARATI.given)} ${pick(GUJARATI.given)} ${pick(GUJARATI.family)} ${pick(GUJARATI.family)} ${pick(GUJARATI.given)} ${pick(GUJARATI.family)}`;
    }
    const pool = r < 0.4 ? GUJARATI : r < 0.75 ? DEVANAGARI : LATIN;
    return `${pick(pool.given)} ${pick(pool.family)}`;
  };
  return { members: tree.members.map((m, i) => ({ ...m, name: name(i) })), relationships: tree.relationships };
}
