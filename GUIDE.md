# How It Works - Detailed Explanations

This guide provides in-depth explanations of how the Persona Ranker system works.

## CSV Upload & Lead Processing

Here's what happens when you upload a CSV file, step by step:

1. **Choose your file**
   Drag and drop your CSV or click to browse. The app accepts CSV files with lead information (name, title, company, etc.)

2. **File validation**
   The system checks if your CSV has all required columns: `firstName`, `lastName`, `jobTitle`, `companyName`, `companyDomain`, etc.

3. **Preview**
   You see the first few rows displayed in a table so you can verify everything looks correct before uploading.

4. **Click "Upload"**
   Once you confirm, the CSV is sent to the server and processing begins.

5. **Import phase** (Progress: 0-40%)
   The server reads each row in your CSV and creates:
   - **Companies** in the database (grouped by domain)
   - **Leads** linked to their companies

6. **Qualification phase** (Progress: 40-70%)
   AI evaluates each lead one by one: *"Does this person match our ideal customer persona?"*

   - **Qualified**: Person fits the profile
     *Example: "VP of Sales at a B2B SaaS company"*

   - **Disqualified**: Person doesn't fit
     *Example: "HR Manager" when we're targeting sales leaders*

   Each lead gets a qualification decision + reasoning explaining why.

7. **Ranking phase** (Progress: 70-100%)
   For each company, AI ranks only the qualified leads from best to worst fit:
   - Groups leads by company
   - Compares leads within the same company
   - Assigns rank numbers (1 = best fit, 2 = second best, etc.)
   - Provides reasoning for each ranking

8. **Results ready!**
   The leads table displays:
   - Qualification status
   - Rank number (for qualified leads)
   - AI reasoning for both qualification and ranking decisions

   You can now sort, filter, and export the top N leads per company.

**Progress bar stages:**
`Uploading → Importing → Qualifying → Ranking → Complete`

---

## Automatic Prompt Optimization

Think of this like teaching an AI judge to get better at ranking leads. Here's how it works:

### The Challenge

Our AI ranks leads using a **prompt** (written instructions we give it). But sometimes the prompt isn't perfect—it might miss important signals or weight things incorrectly. We want to **automatically improve the prompt** without manual trial-and-error.

### The Solution: Beam Search Optimization

**Analogy:** Imagine teaching a talent show judge to score contestants better by:
- Showing them past competitions where you know the correct winners
- Having them practice scoring those competitions
- Analyzing their mistakes and giving specific feedback
- Having them try new judging strategies based on that feedback
- Repeating until they're consistently accurate

### Step-by-Step Process

**1. Start with baseline prompt**
We begin with our current ranking instructions (the "baseline" prompt that tells AI how to evaluate leads).

**2. Evaluation set (the answer key)**
We have 50 leads with **known correct rankings** from human experts. This is our "ground truth" to measure against.

**3. Test the baseline**
Run the baseline prompt on those 50 evaluation leads and compare AI's rankings to the correct ones.
- Calculate error metrics: **MAE** (average rank error), **RMSE** (error magnitude), **Spearman correlation** (ranking agreement)

**4. Generate improvement guidance**
An AI "gradient agent" analyzes the mistakes and writes specific advice:

> *"The current prompt ranks junior employees too highly. Focus more on seniority levels—VP and C-level titles should be weighted significantly higher than Director or Manager titles."*

> *"Decision-making authority is being undervalued. Leads with 'Head of' or 'VP of' in sales/revenue roles should score higher."*

**5. Create new prompt variants**
A "variant generator agent" takes this feedback and creates 5 **new prompts**, each trying a different approach:
- Variant A: Emphasizes title seniority explicitly
- Variant B: Adds decision-making authority scoring
- Variant C: Combines both improvements
- Variant D: Focuses on company fit indicators
- Variant E: Balances multiple factors with weighted criteria

**6. Test all variants**
Run each variant prompt on the 50 evaluation leads and calculate their error metrics.

**7. Keep the best performers**
Pick the **top 2 variants** with lowest error (best rankings).

### How We Determine "Best"

We track 4 metrics for each prompt variant:

| Metric | What it measures | Better = |
|--------|------------------|----------|
| **Kendall's Tau** | Rank order agreement (pairwise comparisons) | Higher |
| **Spearman correlation** | Rank correlation strength | Higher |
| **MAE** | Mean Absolute Error (average rank difference) | Lower |
| **RMSE** | Root Mean Square Error (penalises large errors) | Lower |

#### Why These Metrics?

**Kendall's Tau** asks: *"For every pair of leads, did we get the order right?"*

Imagine you have Lead A and Lead B. The correct ranking says A should be #1 and B should be #2. Kendall's Tau checks: did we rank A above B? It does this for every possible pair, then calculates the percentage of pairs we got right. A score of 1.0 means perfect ordering; 0 means random; negative means we're ranking backwards.

**Spearman correlation** asks: *"How well do the rank positions match up overall?"*

This also measures ranking agreement, but it's more sensitive to how far off the positions are. If we rank someone #1 who should be #5, Spearman notices that gap more than Kendall's Tau does. It's a good secondary check.

**MAE (Mean Absolute Error)** asks: *"On average, how many positions off are we?"*

If Lead A is ranked #3 but should be #1, that's an error of 2 positions. MAE averages all these position errors. An MAE of 1.5 means our rankings are typically 1-2 positions off from the correct answer.

**RMSE (Root Mean Square Error)** asks: *"How bad are our worst mistakes?"*

Similar to MAE, but it penalizes big errors more heavily. If we rank someone #10 who should be #1, RMSE treats that as much worse than being off by 1 position ten times. We track it for monitoring but don't use it for selection.

#### The Priority Order Explained

When comparing prompts, we check metrics in this order:

1. **Kendall's Tau first** — For sales prioritisation, *relative order* is what matters most. Your sales team calls leads in order from best to worst. Whether the best lead is ranked #1 vs #2 matters less than whether they're ranked *above* the worse leads. Kendall's Tau directly measures this: "Did we put the right people ahead of the wrong people?"

2. **Spearman second** — If two prompts have identical Kendall's Tau, we use Spearman as a tiebreaker. It catches edge cases where the pairwise ordering is the same but the position spread is different.

3. **MAE third** — If both correlation metrics are identical (rare), we prefer the prompt with lower MAE. This favours prompts that are closer to the exact correct positions.

4. **RMSE not used** — It's redundant with MAE for selection purposes. We calculate it for diagnostics (spotting outlier errors) but don't use it when choosing between prompts.

#### How Prompts Are Compared

When the optimizer needs to pick the best prompt from a set:

```
Comparing Prompt A vs Prompt B:

Step 1: Compare Kendall's Tau
        → If A is higher, A wins
        → If B is higher, B wins
        → If equal, go to Step 2

Step 2: Compare Spearman correlation
        → If A is higher, A wins
        → If B is higher, B wins
        → If equal, go to Step 3

Step 3: Compare MAE
        → If A is lower, A wins
        → If B is lower, B wins
        → If still equal, they're considered equivalent
```

This comparison is used both when selecting the top candidates each generation and when comparing against the baseline to ensure we don't regress.

#### When Does Optimization Stop?

The optimizer stops early if improvement plateaus:

- After each generation, we check: *"How much did Kendall's Tau improve?"*
- If improvement drops below 1% per generation (and we've run at least 2 generations), we stop
- This prevents wasting time on diminishing returns

The optimizer also stops after the configured maximum number of generations (typically 3-5).

**8. Repeat (next generation)**
Use those top 2 as starting points:
- Generate 5 new variants from Variant A
- Generate 5 new variants from Variant B
- Test all 10 new variants
- Keep the best 2 again

This continues for **3-5 generations**, each time:
- Keeping the best performers
- Generating new variants from them
- Testing and comparing

**9. Deploy the winner**
After all generations, the prompt with the **lowest error** becomes the new ranking prompt.

### Why "Beam Search"?

The name comes from how it explores options:

- **Not exhaustive**: We don't try every possible prompt variation (would take forever)
- **Not greedy**: We don't just follow one single best path (might miss better solutions)
- **Balanced exploration**: Like a flashlight beam, we keep multiple promising candidates (the "beam") and explore from all of them simultaneously

The "beam width" is how many top candidates we keep each generation (usually 2-3).

### Real Example Results

```
Generation 0 (Baseline):
  MAE: 2.5  |  RMSE: 3.1  |  Spearman: 0.65

Generation 1 (5 variants tested):
  Best variant: MAE: 2.1 (16% improvement)

Generation 2 (10 variants from top 2):
  Best variant: MAE: 1.8 (28% improvement)

Generation 3 (10 variants from top 2):
  Best variant: MAE: 1.6 (36% improvement)

Final result: 36% reduction in ranking error!
```

### What This Means

- **Before optimization**: AI would mis-rank a lead by an average of 2.5 positions
- **After optimization**: AI mis-ranks by only 1.6 positions on average
- **Impact**: More accurate lead prioritization → your sales team contacts the right people first
