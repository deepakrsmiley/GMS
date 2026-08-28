import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { getRolePlaybook, playbookStepsForUser } from '../../constants/workflow';
import '../../styles/workflow.css';

export default function RolePlaybook() {
  const { user } = useSelector((s) => s.auth);
  const book = getRolePlaybook(user);
  const steps = playbookStepsForUser(user);
  if (!steps.length) return null;

  return (
    <section className="wf-playbook">
      <div className="wf-playbook__head">
        <div>
          <p className="wf-playbook__eyebrow">Correct workflow</p>
          <h2 className="wf-playbook__title">{book.title}</h2>
        </div>
        <Link to="/how-to-use" className="wf-playbook__all">How to use everything →</Link>
      </div>
      <ol className="wf-playbook__list">
        {steps.map((step, i) => (
          <li key={step.label}>
            {step.to ? (
              <Link to={step.to} className="wf-playbook__item">
                <span className="wf-playbook__n">{i + 1}</span>
                <span>
                  <strong>{step.label}</strong>
                  <em>{step.detail}</em>
                </span>
              </Link>
            ) : (
              <div className="wf-playbook__item">
                <span className="wf-playbook__n">{i + 1}</span>
                <span>
                  <strong>{step.label}</strong>
                  <em>{step.detail}</em>
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
