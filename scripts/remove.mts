#!/usr/bin/env bash
import { rmSync } from 'node:fs';
rmSync('./dist', { recursive: true, force: true });
