import React from 'react';
import { Link } from 'react-router-dom';
import { WORKFLOWS } from '../../constants/workflow';
import '../../styles/workflow.css';

export default function WorkflowStrip({ flow, current }) {
  const def = WORKFLOWS[flow];
  if (!def?.steps?.length) return null;

  const currentIndex = Math.max(0, def.steps.findIndex((s) => s.id === current));

  return (
    <div className="wf-strip" aria-label={`${def.title} steps`}>
      <p className="wf-strip__title">{def.title}</p>
      <ol className="wf-strip__steps">
        {def.steps.map((step, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'todo';
          const inner = (
            <>
              <span className="wf-strip__num">{i + 1}</span>
              <span className="wf-strip__label">{step.label}</span>
              {step.hint ? <span className="wf-strip__hint">{step.hint}</span> : null}
            </>
          );
          return (
            <li key={step.id} className={`wf-strip__step wf-strip__step--${state}`}>
              {step.to ? <Link to={step.to} className="wf-strip__link">{inner}</Link> : <div className="wf-strip__link">{inner}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
