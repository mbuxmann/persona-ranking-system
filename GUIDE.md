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

**Comparison priority (for selecting best prompts):**

1. **Kendall's Tau** - Primary metric. Measures how many pairs of leads are ranked in the correct relative order.
2. **Spearman correlation** - Tiebreaker #1. Another measure of rank agreement.
3. **MAE** - Tiebreaker #2. Average distance between predicted and actual rank.

RMSE is tracked for monitoring but not used in comparison—it's redundant with MAE for ranking purposes.

**Why Kendall's Tau first?**
For lead prioritisation, getting the *order* right matters more than the exact rank number. Kendall's Tau directly measures: "Did we rank Person A above Person B correctly?"

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
