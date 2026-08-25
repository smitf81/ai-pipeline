export default function Home() {
  return (
    <main className="shell">
      <div className="weather" aria-hidden="true" />
      <section className="hero" aria-labelledby="playtest-title">
        <p className="eyebrow">PUBLIC DEMO PLAYTEST · BUILD 0.4 · 3D</p>
        <h1 id="playtest-title">
          BLACK SKY
          <br />
          BOUND
        </h1>
        <p className="premise">
          Hold a storm-battered eyrie against five escalating assaults. Begin with tooth and claw;
          awaken a new survival instinct after every wave.
        </p>
        <div className="actions">
          <a className="play" href="/play/index.html">
            Enter the night
          </a>
          <span>Desktop · keyboard &amp; mouse · headphones recommended</span>
        </div>
      </section>

      <aside className="field-notes" aria-labelledby="notes-title">
        <div className="notes-rule" />
        <p className="notes-label">FIELD NOTES</p>
        <h2 id="notes-title">This is unfinished on purpose.</h2>
        <p>
          We are testing combat readability, rising pressure, and whether earning one instinct at a
          time creates a satisfying ten-minute survival arc.
        </p>
        <dl>
          <div>
            <dt>Goal</dt>
            <dd>Survive five waves and break their spawners</dd>
          </div>
          <div>
            <dt>Pause</dt>
            <dd>Esc · sound controls live here</dd>
          </div>
          <div>
            <dt>Fullscreen</dt>
            <dd>F</dd>
          </div>
          <div>
            <dt>Best with</dt>
            <dd>Sound on and ten quiet minutes</dd>
          </div>
        </dl>
        <div className="feedback">
          <strong>Afterwards, tell Felix:</strong>
          <span>What confused you? When did you feel in control? What stayed with you?</span>
        </div>
      </aside>

      <footer>
        <span>BOUNDED PUBLIC DEMO · ONE ARENA</span>
        <span>PLEASE EXPECT ROUGH EDGES</span>
      </footer>
    </main>
  );
}
