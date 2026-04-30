# commands.csv schema

`timestamp_s,action,x,y,z,theta_deg,duration_s,label`

All timestamps are seconds from the start of `raw.mp4`.

## Fields

| Column | Type | Required | Meaning |
| --- | --- | --- | --- |
| `timestamp_s` | float | yes | When the command starts. |
| `action` | string | yes | One of `move`, `rotate`, or `wait`. |
| `x` | float | move only | Target X position for `move`. |
| `y` | float | move only | Target Y position for `move`. |
| `z` | float | move only | Target Z position for `move`. |
| `theta_deg` | float | rotate only | Claw angle in degrees for `rotate`. |
| `duration_s` | float | no | Animation duration for the command. Defaults to `0`. |
| `label` | string | no | Free-text note for debugging. |

## Example

```csv
timestamp_s,action,x,y,z,theta_deg,duration_s,label
0.00,move,0,100,50,,0.00,home
0.25,move,20,100,60,,0.25,slide right
0.60,rotate,,,,35,0.15,open claw
1.00,wait,,,,,0.50,pause
```