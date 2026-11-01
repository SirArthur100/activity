# Nuclear medicine activity calculator

A mobile-first static webpage for correcting measured syringe activity to an administration time, with optional post-administration syringe residue correction. Runs entirely in the browser using HTML, CSS, and JavaScript, without runtime dependencies, accounts, analytics, or a backend.

## Run locally

Requires Node.js 20 or newer for tests/builds, and Python 3 for the preview command. No `npm install` is needed.

```sh
npm test
npm run build
npm run dev
```

Open <http://localhost:4173>. Serve the files over HTTP; opening `index.html` directly with `file://` can block JavaScript module loading.

The build writes only the public application assets into `dist/`. You can serve this folder with any static HTTP host.

## Publish on GitHub Pages

1. Put these source files into your GitHub repository on `main` or `master`, including `.github/workflows/deploy.yml`.
2. Open the repository's **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Push a change, or open **Actions → Test and deploy GitHub Pages → Run workflow**.
4. Wait for both the build and deployment jobs to succeed. The deployment provides the live URL, usually `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

The workflow runs the calculation tests before building and publishing. Pull requests run tests and builds without deploying. Relative asset paths support both a project subdirectory and a root/custom-domain site. No personal access token is needed for the workflow.

See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for hosting configuration and repository eligibility. This project does not create a GitHub repository or enable Pages automatically.

## Calculation

Let `Aₘ` be measured activity at time `tₘ`, `tₐ` the administration time, and `T½` the isotope's physical half-life. Gross activity at administration is:

```text
A_gross = Aₘ × 2^(-(tₐ − tₘ) / T½)
```

When residue `Aᵣ` is measured at `tᵣ` after administration, it is corrected **backwards** to the administration time before subtraction:

```text
A_residue_at_administration = Aᵣ × 2^((tᵣ − tₐ) / T½)
A_net = A_gross − A_residue_at_administration
```

All time intervals use the same units as the half-life. Unit conversions use `1 mCi = 37 MBq`, `1 µCi = 0.037 MBq`, and `1 GBq = 1000 MBq`. Intermediate calculations retain floating-point precision; rounding applies only to displayed values.

Physical half-lives are central values from the [LNHB Decay Data Evaluation Project](https://www.lnhb.fr/nuclear-data/nuclear-data-table/), such as the [Tc-99m evaluation](https://www.lnhb.fr/nuclides/Tc-99m_tables.pdf). The constants and a direct evaluation link for every supported isotope are defined in `js/calculator.js` and shown in the webpage's reference section.

This is a physical-decay calculation, not an absorbed-dose calculation, prescribing tool, or model of biological clearance. It assumes administration at a single entered time and does not model a prolonged infusion. Before clinical use, the department should independently validate the constants, rounding, and example cases against its approved procedures and instruments.

## Dates, units, and privacy

- Measurement and administration dates start at today's date in the device's local timezone. Check the device timezone and clock before entering measurements.
- Times are intentionally blank until entered or set with **Now**. Seconds are supported, including for short-lived isotopes. **Now** sets both the date and time of that reading; interval shortcuts set administration relative to the measurement time.
- Date/time comparisons include the date, so crossing midnight requires the correct next-day date.
- Nonexistent times during the spring clock change and repeated times during the autumn clock change are rejected. Other intervals across a clock change use actual elapsed time.
- The initial measurement must be at or before administration. A residue measurement must be at or after administration. An impossible negative net activity is rejected.
- Activity accepts a decimal point or decimal comma. Do not use thousands separators.
- A unit selector identifies the unit of the entered reading: entering `20` and selecting `mCi` means `20 mCi`. Changing the selector does not convert the entered number. The residue reading can have a different unit.
- Results use the initial reading's unit and also show an alternate unit. Up to six significant digits are displayed; very small or large results use scientific notation. Calculations use unrounded values.
- **New calculation** clears readings and times and refreshes the dates to today while retaining the selected isotope and activity unit.
- The app does not ask for patient identifiers, send entered activity data to a server, or store calculations persistently. A hosting provider may log ordinary page requests.

## Project layout

```text
index.html                     Accessible calculator interface
styles.css                     Responsive mobile and desktop layout
js/app.js                      Form interaction and result display
js/calculator.js               Pure calculation, validation, isotope data
js/format.js                   Significant-digit and elapsed-time formatting
tests/calculator.test.js       Calculation and boundary-case tests
tests/format.test.js           Display-precision regression tests
scripts/build.mjs              Static asset packaging
.github/workflows/deploy.yml   Test, build, and GitHub Pages deployment
```

## Verification

The automated tests cover known decay examples, half-lives, mixed units, residue back-correction, impossible readings, overnight intervals, calendar validity, daylight-saving changes, and display precision. Run `npm test` before publishing. In environments that restrict child-process creation, run the suites directly with `node tests/calculator.test.js` and `node tests/format.test.js`.

Before rollout, check the page in your department's phone browsers, including native date/time controls, decimal-keypad entry, and copying a completed calculation. The implementation environment prevented browser and HTTP-preview launches, so automated mathematical and source checks do not constitute device or clinical validation.
